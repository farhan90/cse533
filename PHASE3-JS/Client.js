var http = require('http');
var fs = require('fs');

module.exports = {
	createClient: function(port, ip, transactions, randomData, master, bankNames, clientNum) {
		return new Client(port, ip, transactions, randomData, master, bankNames, clientNum);
	}
};


//returns a random request type
Client.prototype.randRequest = function() {
	var randNum = Math.random();
	if(randNum < this.random.probGetBalance)
		return "getBalance";
	randNum -= this.random.probWithdraw;
	if(randNum < this.random.probDeposit)
		return "deposit";
	return "withdraw";
}

//returns a random bank
Client.prototype.randBank = function() {
	var randNum = randomInt(0, this.bankNames.length);
	return this.bankNames[randNum];
}

//returns a random int from low inclusice to high exclusive
function randomInt (low, high) {
    return Math.floor(Math.random() * (high - low) + low);
}


//constructor for Client class
function Client(port, ip, transactions, randomData, master, bankNames, clientNum) {
	//transactions list of {type, accountNum, amount, bank}
	this.transactions = transactions;
	this.port = port;
	this.ip = ip;

	this.clientNum = clientNum;
	this.reqCount = 0;

	this.bankNames = bankNames;

	// random dict of {seed, numReq, probGetBalance, probDeposit, probWithdraw
	this.random = randomData;

	//master {ip, port}
	this.master = master;

	this.lastHead = null;
	this.lastTail = null;
	this.currentTransactionIndex = 0;

	this.responsesRecieved = [];

	this.wstream = null;
	var clientServer = this;
	fs.mkdir('./logs',function(e){
		fs.mkdir('./logs/clients',function(e){
			clientServer.wstream = fs.createWriteStream('./logs/clients/client' + clientServer.clientNum + '.log');
		});
	});

	sendCurrentTransaction(this);
	//send all the transactions after i*2 seconds
	//for(var i in transactions)
	//	this.sendTransaction(transactions[i], i*2);

	//create the random requests
	if(this.random) {
		//create random requests
		for(var i = 0; i<this.random.numReq; i++) {
			var randReq = this.randRequest();
			if(randReq == "getBalance") {
				var transaction = {
					"type" : "getBalance",
					"accountNum" : randomInt(0, 5),
					"bank" : this.randBank()
				}
				this.sendTransaction(transaction, i*2);
			}
			else {
				var transaction = {
					"type" : (randomInt(0,100) < 50)? "deposit" : "withdraw",
					"accountNum" : randomInt(0, 5),
					"bank" : this.randBank(),
					"amount" : randomInt(0, 100)
				}
				this.sendTransaction(transaction, i*2);
			}
		}
	}

	this.createServer();
}

function sendCurrentTransaction(clientServer) {
	if(clientServer.currentTransactionIndex < clientServer.transactions.length) {
		var indexSent = clientServer.currentTransactionIndex;
		var trans = clientServer.transactions[clientServer.currentTransactionIndex];
		clientServer.sendTransaction(trans, 2);
		setTimeout(function() {
			if(indexSent == clientServer.currentTransactionIndex) {
				//we timed out and still waiting on this :( -> RESEND IT
				log("Time out occurred for seqNum: " + indexSent, clientServer);
				sendCurrentTransaction(clientServer);
			}
		}, 1000 * 12);
	}
}

//helper for sending transactions - sends to either head or tail
Client.prototype.sendTransaction = function(transaction, seconds) {
	if(transaction.type == "deposit" || transaction.type == "withdraw")
		this.sendTransactionToHead(transaction.bank, transaction.accountNum, transaction.amount, seconds, transaction.type, transaction.reqId);
	else if(transaction.type == "getBalance")
		this.sendTransactionToTail(transaction.bank, transaction.accountNum, seconds, transaction.type);
}

Client.prototype.sendTransactionToHead = function(bank, accountNum, amount, seconds, type, reqId) {
	var reqId = reqId? reqId : this.genReqId(bank);
	var clientServer = this;

	//get the head, on completion send the request
	setTimeout(function() {
		clientServer.getHeadFromMaster(bank, function(resObj) {
			if(JSON.stringify(clientServer.lastHead) != JSON.stringify(resObj)) {
				clientServer.lastHead = resObj;
				log("New Head detected: " + JSON.stringify(resObj),clientServer);
			}
			sendRequest(resObj.ip, resObj.port, {
				reqId 	: reqId,
				type 	: type,
				amount 	: amount,
				accountNum 	: accountNum,
				client : {
					port : clientServer.port,
					ip : clientServer.ip
				}
			}, null, clientServer);
		}, clientServer);
	}, 1000 * seconds);
}

Client.prototype.sendTransactionToTail = function(bank, accountNum, seconds, type) {
	var reqId = this.genReqId(bank);
	var clientServer = this;

	//get the tail, on completion send the request
	setTimeout(function() {
		clientServer.getTailFromMaster(bank, function(resObj) {
			if(JSON.stringify(clientServer.lastTail) != JSON.stringify(resObj)) {
				clientServer.lastTail = resObj;
				log("New Tail detected: " + JSON.stringify(resObj),clientServer);
			}
			sendRequest(resObj.ip, resObj.port, {
				reqId 	: reqId,
				type 	: type,
				accountNum 	: accountNum,
				client : {
					port : clientServer.port,
					ip : clientServer.ip
				}
			}, function(response) {
				getResponseObj(response, function(resObj) {
					log("Get Balance Response from tail: " + JSON.stringify(resObj), clientServer);
					clientServer.currentTransactionIndex++;
					sendCurrentTransaction(clientServer);
				});
			}, clientServer);
		}, clientServer);
	}, 1000 * seconds);
}


//helper for getting head, uses callback
Client.prototype.getHeadFromMaster = function(bank, callback, clientServer) {
	sendRequest(this.master.ip, this.master.port, {
		'type' : 'getHeadForBank',
		'bank' : bank
	}, function (response) {
		getResponseObj(response, callback);
	}, clientServer);
}

//helper for getting tail, uses callback
Client.prototype.getTailFromMaster = function(bank, callback, clientServer) {
	sendRequest(this.master.ip, this.master.port, {
		'type' : 'getTailForBank',
		'bank' : bank
	}, function (response) {
		getResponseObj(response, callback);
	}, clientServer);
}

//helper for sending request to ip - port
function sendRequest(ip, portNum, reqObj, callback, clientServer) {
	var options = {
		hostname	: ip,
		port		: portNum,
		method 		: 'POST',
		path 		: '/'
	};
	reqObj['sender'] = reqObj.client;
	if(reqObj.client != null) {
		log("\nCLIENT SENDING REQUEST!! : " + JSON.stringify(reqObj) + ": ip: " + ip + ", port: "+ portNum + "\n", clientServer);
	}

	var req = http.request(options, (callback != null)? callback : handleResponse);
	var reqText = JSON.stringify(reqObj);
	req.write(reqText);
	req.on('error', function(error) {
	  	// Error handling here
	  	log("IN CLIENT - REQUEST ERROR CAUGHT: " + error, clientServer);
	});
	req.end();
}

//helper for extracting the JSON object from the response
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

//helper for generating request id
Client.prototype.genReqId = function(bank) {
	arguments.callee.banks = arguments.callee.banks || [];
	var allBanks = arguments.callee.banks;
	if(allBanks.indexOf(bank) == -1)
		allBanks.push(bank);
	var bnkNum = allBanks.indexOf(bank);

	var reqId = bnkNum + "."  + this.clientNum + "." + this.currentTransactionIndex;
	return reqId;
}

//#pragma mark - Listening

Client.prototype.createServer = function() {
	log("Client: Attempting to listen on: " + this.port, this);
	var clientServer = this;

	http.createServer(function(request, response) {
		var reqData = "";
		request.on('data', function(chunk) {
			reqData += chunk;
		});
		request.on('end', function() {
			var reqObj = JSON.parse(reqData);
			recieved(reqObj, response, clientServer);
			response.end();
		});
	}).listen(this.port);
}

function recieved(data, response, clientServer) {
	delete data.client;
	var found = false;
	for(var i in clientServer.responsesRecieved) {
		var res = clientServer.responsesRecieved[i];
		if(JSON.stringify(res) === JSON.stringify(data))
			found = true;
	}
	if(found)
		log("CLIENT RECIEVED DUPLICATE: " + JSON.stringify(data) + "\n\n", clientServer);
	else {
		log("CLIENT RECIEVED: " + JSON.stringify(data) + "\n\n", clientServer);
		clientServer.responsesRecieved.push(data);
	}
	clientServer.currentTransactionIndex++;
	sendCurrentTransaction(clientServer);
}

//#pragma mark - logging

function log(text, client) {
	var d = new Date().getTime();
	text = JSON.stringify(d) + ': ' + client.clientNum + ': ' + text;
	console.log(text);

	if(client.wstream != null) {
		client.wstream.write(text);
		client.wstream.write('\n\n');
	}
}

