//pragma mark - Requires
var http = require('http');
var fs = require('fs');


//pragma mark - Public Methods

module.exports = {
  	createBankServer: function(ip, port, bank, master, startTime, numSent, numRecv) {
  		return new BankServer(ip, port, bank, master, startTime, numSent, numRecv);
  	}
};

//pragma mark - Creating Server

function BankServer(ip, port, bank, master, startTime, numSent, numRecv) {
	this.master = master;
	this.ip = ip;
	this.port = port;
	this.bank = bank;
	this.startTime = startTime;
	this.numSentTotal = (numSent == 0)? Math.random() * 15 : numSent;
	this.numRecvTotal = (numRecv == 0)? Math.random() * 15 : numRecv;
	this.numSent = 0;
	this.numRecv = 0;
	this.order = 0;
	this.responses = {};

	this.suc = null;
	this.pred = null;
	this.accounts = {};
	this.pendingList = [];
	this.proccessedTrans = {};
	this.alive = (startTime  == 0);
	this.newNodeJoining = false;
	this.imJoining = false;

	var bankServer = this;
	this.wstream = null;
	fs.mkdir('./logs',function(e){
		fs.mkdir('./logs/' + bank,function(e){
			bankServer.wstream = fs.createWriteStream('./logs/' + bank + '/port' + port + '.log');
		});
	});

	if(this.startTime == 0)
		this.createServer();
	else
		setTimeout(function() {
			log("Booting up server", bankServer)
			bankServer.alive = true;
			bankServer.createServer();
		}, 1000 * this.startTime);
}

BankServer.prototype.createServer = function() {
	//log("BS: Attempting to listen on: " + this.port);
	var bankServer = this;

	var server = http.createServer(function(request, response) {
		var reqData = "";
		request.on('data', function(chunk) {
			reqData += chunk;
		});
		request.on('end', function() {
			var reqObj = JSON.parse(reqData);
			recieved(reqObj, response, bankServer, server);
			if(bankServer.numRecvTotal != -1 && bankServer.numRecv >= bankServer.numRecvTotal && bankServer.alive) {
				//kill the server
				log("Server recieved it's limit\nTerminating....", bankServer);
				request.connection.destroy();
				server.close();
				bankServer.alive = false;
			}
		});
	}).listen(this.port);


	setInterval(function() {
		if(bankServer.alive)
			sendRequest(bankServer.master.ip, bankServer.master.port, {
					'type' 	: 'ImAlive',
					'pk' 	: bankServer.port,
					'bank'	: bankServer.bank
				}, null, bankServer, null);
	}, 1000);
}

BankServer.prototype.toString = function() {
	return "ip: " + this.ip + ", port: " + this.port + ", bank: " + this.bank;
};

//pragma mark - Bank Handle Methods

function sendPendingListToClient(bankServer, httpServer) {
	for(var i in bankServer.pendingList) {
		var data = bankServer.pendingList[i];
		var responseForClient = bankServer.responses[data.order];
		log("Sending to client: " + JSON.stringify(responseForClient), bankServer);
		sendRequest(responseForClient.client.ip, responseForClient.client.port, responseForClient, null, bankServer, httpServer);

		if(bankServer.pred != null) {
			data['sender'] = {
				ip : bankServer.ip,
				port : bankServer.port
			}
			log("Sending ACK to pred: " + data.order, bankServer);
			sendRequest(bankServer.pred.ip, bankServer.pred.port, data, null, bankServer, httpServer);
		}
	}
	removeItemFromPendingList(99999, bankServer.pendingList, bankServer);
}

function sendDataToNewTail(data, bankServer, httpServer) {

	var freezeTrans = JSON.parse(JSON.stringify(bankServer.proccessedTrans));
	var freezeActs = JSON.parse(JSON.stringify(bankServer.accounts));
	log('Frozen transaction: ' + JSON.stringify(freezeTrans), bankServer);
	sendRequest(data["ip"], data["port"], {
			"type" : "accounts",
			"accounts" : freezeActs,
			"sender" : {
				"ip" : bankServer.ip,
				"port" : bankServer.port
			} 
		}, null, bankServer, httpServer);
	
	setTimeout(function() {
		//send all proccessedTrans
		for(var i in freezeTrans) {
			if(bankServer.newNodeJoining == false) return;
			sendRequest(data["ip"], data["port"], {
				"type" : "proccessedTrans",
				"transaction" : bankServer.proccessedTrans[i],
			}, null, bankServer, httpServer);
		}

		//send pending list
		for(var i in bankServer.pendingList) {
			if(bankServer.newNodeJoining == false) return;
			var sendData = bankServer.pendingList[i];
			sendData['sender'] = {
				ip : bankServer.ip,
				port : bankServer.port
			}
			log("Sending pending item: " + JSON.stringify(sendData) + " to new tail @ " + JSON.stringify(data), bankServer);
			sendRequest(data.ip, data.port, sendData, null, bankServer, httpServer);
		}

		//send end of sent
		if(bankServer.newNodeJoining == false) return;
		sendRequest(data["ip"], data["port"], {
			"type" : "endOfSent"
		}, null, bankServer, httpServer);

		if(bankServer.newNodeJoining == false) return;
		bankServer.suc = {
			'ip' : data.ip,
			'port' : data.port
		};
		if(bankServer.alive) {
			log("I finished sending data to the new tail: " + JSON.stringify(data), bankServer);
			bankServer.newNodeJoining = false;
		}
	}, 1000*3);
}

function recieved(data, response, bankServer, httpServer) {
	if(bankServer.alive == false) return;

	bankServer.numRecv++;
	if(data.type == "oldTailCrash") {
		log("The tail crashed while we were joining....\nWill wait for old tails pred to be informed", bankServer);
		bankServer.imJoining = false;
		bankServer.proccessedTrans = {};
		bankServer.accounts = {}
	}
	else if(data.type == "YouveGotAFriend") {
		if(data.port == -1) {
			//the new tail failed
			log("I was made aware that the joining tail crashed", bankServer);
			bankServer.newNodeJoining = false;
			sendPendingListToClient(bankServer, httpServer);
			bankServer.suc = null;
		}
		else {
			log("I was made aware of the new tail!!", bankServer);
			bankServer.newNodeJoining = true;
			sendDataToNewTail(data, bankServer, httpServer);
		}
		response.end();
	}
	else if(data.type == "accounts") {
		bankServer.pred = data["sender"];
		bankServer.imJoining = true;
		log("my pred and old tail was: " + JSON.stringify(data["sender"]), bankServer);
		bankServer.suc = null;

		log("Joining node got accounts: " + JSON.stringify(data["accounts"]), bankServer);
		bankServer.accounts = data["accounts"];
		response.end();
	}
	else if(data.type == "proccessedTrans") {
		log("Joining node recieved a transaction: " + JSON.stringify(data["transaction"]), bankServer);
		bankServer.proccessedTrans[data["transaction"].reqId] = data["transaction"];
		response.end();
	}
	else if(data.type == "endOfSent") {
		if(bankServer.alive) {
			log("Joining node ready - informing master + bank = " + bankServer.bank, bankServer);
			bankServer.imJoining = false;
			sendRequest(bankServer.master.ip, bankServer.master.port, {
				"type": "NewTailReady",
				"ip"  : bankServer.ip,
				"port" : bankServer.port,
				"bank" : bankServer.bank
	 		}, null, bankServer, httpServer);
		}
		response.end();
	}
	else if(data.type == "NewPredSuccCrash") {
		var oldPred = bankServer.pred;
		var oldSuc = bankServer.suc;

		var newPred = data.newPred;
		var newSuc = data.newSucc;
		log("\n\nFailure Detected? " + JSON.stringify(data), bankServer);
		log("oldSuc = " + JSON.stringify(oldSuc) + ", oldPred = " + JSON.stringify(oldPred), bankServer);

		if(newSuc == null || portAndIPCheck(oldSuc, newSuc) == false) {
			if(newSuc == null) {
				log("BS: Detected Failure from Master, I am the tail.", bankServer);
				//send pending list to client and replys back to pred
				sendPendingListToClient(bankServer, httpServer);
			}
			else {
				log("BS: Detected Failure from Master, New Suc is: " + JSON.stringify(newSuc), bankServer);
				
				//send pending list to new successor
				log("Sending pendingList to the new successor: " + JSON.stringify(bankServer.pendingList), bankServer);
				for(var i in bankServer.pendingList) {
					var sendData = bankServer.pendingList[i];
					sendData['sender'] = {
						ip : bankServer.ip,
						port : bankServer.port
					}
					sendRequest(newSuc.ip, newSuc.port, sendData, null, bankServer, httpServer);
				}
			}
		}

		bankServer.pred = newPred;
		bankServer.suc = newSuc;

		response.end();
	}
	else {
		//the request is from either the client or the predecessor - send transaction to either head or tail
		if(portAndIPCheck(data.sender, data.client) || portAndIPCheck(data.sender, bankServer.pred)) {
			if(data.type == "withdraw" || data.type == "deposit") {
				normalTransaction(data, response, bankServer, httpServer);
				response.end();
			}
			else if(data.type == "getBalance")
				getBalance(data, response, bankServer);

		}
		else if(portAndIPCheck(data.sender, bankServer.suc)) {

			//the request was from the successor - remove item from pendingList and send confirmation to pred
			removeItemFromPendingList(data.order, bankServer.pendingList, bankServer);
			if(bankServer.pred != null) {
				data['sender'] = {
					ip : bankServer.ip,
					port : bankServer.port
				}
				sendRequest(bankServer.pred.ip, bankServer.pred.port, data, null, bankServer, httpServer);
			}
			response.end();
		}
		else {
			//should not happen
			log("ERROR THIS SHOULDN'T BE CALLED 3894",bankServer);
			response.end();
		}
	}
}

//helper for removing item from pending list
function removeItemFromPendingList(order, pendingList, bankServer) {
	log("Removing ACKS below " + order, bankServer);
	var len = pendingList.length;
	var index = 0;
	for(var i=0; i<len; i++) {
		if(index < pendingList.length && order >= pendingList[index].order) {
			var ofd = bankServer.responses;
			var ordert = pendingList[index].order;
			delete ofd[ordert];
			log("BS Removing " + JSON.stringify(pendingList[index]) + ", from pendingList" + " len: " + (pendingList.length-1), bankServer);
			pendingList.splice(index, 1);
			index--;
		}
		index++;
	}
}

//helper for comparing ip and ports
function portAndIPCheck(s1, s2) {
	if(s1 == null && s2 == null)
		return true;
	else if(s1 != null && s2 != null)
		return s1.port == s2.port && s1.ip == s2.ip;
	else
		return false;
}

//getBalance - takes in response and sends back balance to client
function getBalance(data, response, bankServer) {
	var accounts = bankServer.accounts;
	var balance = accounts[data.accountNum] ? accounts[data.accountNum] : 0;

	log("BS recieved get balance request: " + JSON.stringify(data), bankServer);
	response.writeHead(200);
	response.end(JSON.stringify({
		reqID		: data.reqId,
		balance 	: balance,
		outcome 	: "Proccessed"
	}));
}

//helper for withdraw and deposit - takes in request data, and response, sends info to correct parties
function normalTransaction(data, response, bankServer, httpServer) {
	var accounts = bankServer.accounts;
	log("BS Data: " + JSON.stringify(data), bankServer);

	//create account if none exists
	if(accounts[data.accountNum] == null) {
		accounts[data.accountNum] = 0;
		log("BS: created account: " + data.accountNum, bankServer);
	}

	var outcome = "";

	//if transaction has not been processed
	if(bankServer.proccessedTrans[data.reqId] == null) {

		//if deposit - add funds to the account and record in proccessedTrans
		if(data.type == "deposit") {
			accounts[data.accountNum] += data.amount;
			outcome = "Proccessed";
			bankServer.proccessedTrans[data.reqId] = data;
			log("BS: Adding data to proccessedTrans: " + JSON.stringify(data), bankServer);
		}
		//if withdraw - check if there are enough funds
		else if(data.type == "withdraw") {
			if(accounts[data.accountNum] < data.amount) {
				outcome = "InsufficientFunds";
				log("BS: InsufficientFunds - only had " + accounts[data.accountNum] + ", requested: " + data.amount, bankServer);
			}
			else {
				//if enough funds, reduce amount and record proccessedTrans
				accounts[data.accountNum] -= data.amount;
				outcome = "Proccessed";
				bankServer.proccessedTrans[data.reqId] = data;
				log("BS: Adding data to proccessedTrans: " + JSON.stringify(data), bankServer);
			}
		}
	}
	//transaction is processed
	else {
		//check if exact transaction has occurred already
		if(compareData(bankServer.proccessedTrans[data.reqId], data)) 
			outcome = "Proccessed";
		else 
			outcome = "IncosistentHistory";
	}


	//create the response Object
	var resObj = {
		reqId 	: data.reqId,
		outcome : outcome,
		balance : accounts[data.accountNum]
	};
	data['sender'] = {
		ip : bankServer.ip,
		port : bankServer.port
	}
	//if we are the tail - send reply back to client, send ACK back to previous
	if(bankServer.suc == null) {

		if(bankServer.imJoining) {
			//I AM CURRENTLY JOINING....
			log("I am joining the chain - adding to pending list: " + JSON.stringify(data), bankServer);
			//the old tail sent back to the client - no need to... pending list of other nodes will 
			//have these items in them until we get a normal transaction
		}
		else {
			//I AM THE TAIL - EITHER SEND TO CLIENT OR ADD TO PENDING LIST
			if(bankServer.newNodeJoining == false) {
				if(bankServer.pred != null) {
					sendRequest(bankServer.pred.ip, bankServer.pred.port, data, null, bankServer, httpServer);
					log("Sending ACK back to pred", bankServer);
				}
			}
			else if(bankServer.newNodeJoining) {
				log("New tail is joining so adding to pending list: " + JSON.stringify(data), bankServer);
				bankServer.pendingList.push(data);	
			}

			log('Sending to client: ' + JSON.stringify(resObj), bankServer);
			sendRequest(data.client.ip, data.client.port, resObj, null, bankServer, httpServer);

			resObj['client'] = data.client;
			bankServer.responses[data.order] = resObj;
		}
	}
	//else we are not the tail, forward the request to the successor
	else {
		if(bankServer.pred == null)
			data['order'] = bankServer.order++;
		log("Sending to suc + adding to pending list: " + JSON.stringify(data), bankServer);

		bankServer.pendingList.push(data);
		sendRequest(bankServer.suc.ip, bankServer.suc.port, data, null, bankServer, httpServer);
		resObj['client'] = data.client;
		bankServer.responses[data.order] = resObj;
	}
}

//helper for comparing to request objects - ignores client and sender fields
function compareData(d1, d2) {
	for(var key1 in d1) {
		if(key1 != "sender" && key1 != "client" && key1 != "order") {
			if(d1[key1] != d2[key1])
				return false;
		}
	}
	for(var key2 in d2) {
		if(key2 != "sender" && key2 != "client" && key2 != "order") {
			if(d1[key2] != d2[key2])
				return false;
		}
	}
	return true;
}

//#pragma mark - Master Communication

//helper for requesting successor and predecessor from the master
BankServer.prototype.getSucAndPred = function() {
	var bs = this;
	sendRequest(this.master.ip, this.master.port, {
		'type' 	: 'getSucAndPred',
		'bank' 	: this.bank,
		'port' 	: this.port,
		'ip'	: this.ip
	}, function(resObj) {
		bs.suc = resObj.suc;
		bs.pred = resObj.pred;	
	}, this, null);
}

//#pragma mark - Generic Request/Response Handling

//helper for sending a request to a given ip-port
function sendRequest(ip, portNum, reqObj, callback, bankServer, httpServer) {
	if(bankServer.alive && (bankServer.numSent < bankServer.numSentTotal || bankServer.numSentTotal == -1)) {
		var options = {
		hostname	: ip,
		port		: portNum,
		method 		: 'POST',
		path 		: '/'
		};
		var req = http.request(options, (callback != null)? function(response) {
			getResponseObj(response, callback);
		} : handleResponse);
		var reqText = JSON.stringify(reqObj);
		req.write(reqText);
		req.on('error', function(error) {

		});

		req.end();

		if(httpServer != null) {
			bankServer.numSent++;
			if(bankServer.numSent >= bankServer.numSentTotal && bankServer.numSentTotal != -1) {
				log("Server sent it's limit\nTerminating....", bankServer);
				httpServer.close();
				bankServer.alive = false;
			}
		}
	}
}

//helper for extracting data from the response
function getResponseObj(response, callback) {
	var serverData = '';
	response.on('data', function(chunk) {
		serverData += chunk;
	});

	response.on('end', function() {
		if(callback != null)
			callback(JSON.parse(serverData));
	});
}

function handleResponse(response) {
	getResponseObj(response, null);
}


//#pragma mark - logging

function log(text, bankServer) {
	var d = new Date().getTime();
	text = JSON.stringify(d) + ': ' + bankServer.port + ': ' + text;
	console.log(text);

	if(bankServer.wstream != null) {
		bankServer.wstream.write(text);
		bankServer.wstream.write('\n\n');
	}
}
