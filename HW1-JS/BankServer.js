//pragma mark - Requires
var http = require('http');

//pragma mark - Public Methods

module.exports = {
  	createBankServer: function(ip, port, bank, master) {
  		return new BankServer(ip, port, bank, master);
  	}
};

//pragma mark - Creating Server

function BankServer(ip, port, bank, master) {
	this.master = master;
	this.ip = ip;
	this.port = port;
	this.bank = bank;
	this.suc = null;
	this.pred = null;
	this.accounts = {};
	this.pendingList = [];
	this.proccessedTrans = {};
	this.createServer();
}

BankServer.prototype.createServer = function() {
	//console.log("BS: Attempting to listen on: " + this.port);
	var bankServer = this;

	http.createServer(function(request, response) {
		var reqData = "";
		request.on('data', function(chunk) {
			reqData += chunk;
		});
		request.on('end', function() {
			var reqObj = JSON.parse(reqData);
			recieved(reqObj, response, bankServer);
		});
	}).listen(this.port);
}

BankServer.prototype.toString = function() {
	return "ip: " + this.ip + ", port: " + this.port + ", bank: " + this.bank;
};

//pragma mark - Bank Handle Methods

function recieved(data, response, bankServer) {

	//the request is from either the client or the predecessor - send transaction to either head or tail
	if(portAndIPCheck(data.sender, data.client) || portAndIPCheck(data.sender, bankServer.pred)) {
		if(data.type == "withdraw" || data.type == "deposit") {
			normalTransaction(data, response, bankServer);
			response.end();
		}
		else if(data.type == "getBalance")
			getBalance(data, response, bankServer);

	}
	else if(portAndIPCheck(data.sender, bankServer.suc)) {

		//the request was from the successor - remove item from pendingList and send confirmation to pred
		removeItemFromPendingList(data, bankServer.pendingList);
		if(bankServer.pred != null) {
			data['sender'] = {
				ip : bankServer.ip,
				port : bankServer.port
			}
			sendRequest(bankServer.pred.ip, bankServer.pred.port, data, null);
		}
		response.end();
	}
	else {
		//should not happen
		response.end();
	}
}

//helper for removing item from pending list
function removeItemFromPendingList(data, pendingList) {
	for(var i=0; i<pendingList.length; i++) {
		if(data.reqId == pendingList[i].reqId) {
			console.log("BS Removing " + JSON.stringify(pendingList[i]) + ", from pendingList");
			pendingList.splice(i, 1);
			break;
		}
	}
}

//helper for comparing ip and ports
function portAndIPCheck(s1, s2) {
	if(s1 == null || s2 == null)
		return false;
	return s1.port == s2.port && s1.ip == s2.ip;
}

//getBalance - takes in response and sends back balance to client
function getBalance(data, response, bankServer) {
	var accounts = bankServer.accounts;
	var balance = accounts[data.accountNum] ? accounts[data.accountNum] : 0;

	response.writeHead(200);
	response.end(JSON.stringify({
		reqID		: data.reqId,
		balance 	: balance,
		outcome 	: "Proccessed"
	}));
}

//helper for withdraw and deposit - takes in request data, and response, sends info to correct parties
function normalTransaction(data, response, bankServer) {
	var accounts = bankServer.accounts;
	console.log("BS Data: " + JSON.stringify(data));

	//create account if none exists
	if(accounts[data.accountNum] == null) {
		accounts[data.accountNum] = 0;
		console.log("BS: created account: " + data.accountNum);
	}

	var outcome = "";

	//if transaction has not been processed
	if(bankServer.proccessedTrans[data.reqId] == null) {

		//if deposit - add funds to the account and record in proccessedTrans
		if(data.type == "deposit") {
			accounts[data.accountNum] += data.amount;
			outcome = "Proccessed";
			bankServer.proccessedTrans[data.reqId] = data;
		}
		//if withdraw - check if there are enough funds
		else if(data.type == "withdraw") {
			if(accounts[data.accountNum] < data.amount) {
				outcome = "InsufficientFunds";
			}
			else {
				//if enough funds, reduce amount and record proccessedTrans
				accounts[data.accountNum] -= data.amount;
				outcome = "Proccessed";
				bankServer.proccessedTrans[data.reqId] = data;
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
		console.log("Sending to client: " + JSON.stringify(resObj));
		sendRequest(data.client.ip, data.client.port, resObj, null);
		sendRequest(bankServer.pred.ip, bankServer.pred.port, data, null);
	}
	//else we are not the tail, forward the request to the successor
	else {
		console.log("Sending to suc: " + JSON.stringify(data));
		bankServer.pendingList.push(data);
		sendRequest(bankServer.suc.ip, bankServer.suc.port, data, null);
	}
}

//helper for comparing to request objects - ignores client and sender fields
function compareData(d1, d2) {
	for(var key1 in d1) {
		if(key1 != "sender" && key1 != "client") {
			if(d1[key1] != d2[key1])
				return false;
		}
	}
	for(var key2 in d2) {
		if(key2 != "sender" && key2 != "client") {
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
	});
}

//#pragma mark - Generic Request/Response Handling

//helper for sending a request to a given ip-port
function sendRequest(ip, portNum, reqObj, callback) {
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
	req.end();
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

