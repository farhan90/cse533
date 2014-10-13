var http = require('http');

module.exports = {
	createClient: function(port, ip, transactions, randomData, master, bankNames) {
		return new Client(port, ip, transactions, randomData, master, bankNames);
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
function Client(port, ip, transactions, randomData, master, bankNames) {
	//transactions list of {type, accountNum, amount, bank}
	this.transactions = transactions;
	this.port = port;
	this.ip = ip;

	this.bankNames = bankNames;

	// random dict of {seed, numReq, probGetBalance, probDeposit, probWithdraw
	this.random = randomData;
	console.log(this.random);
	//master {ip, port}
	this.master = master;

	//send all the transactions after i*2 seconds
	for(var i in transactions)
		this.sendTransaction(transactions[i], i*2);

	//create the random requests
	if(this.random) {
		//create random requests
		for(var i = 0; i<this.random.numReq; i++) {
			var randReq = this.randRequest();
			if(randReq == "getBalance") {
				var transaction = {
					"type" : "getBalance",
					"accountNum" : randomInt(0, 10),
					"bank" : this.randBank()
				}
				this.sendTransaction(transaction, i*2);
			}
			else {
				var transaction = {
					"type" : (randomInt(0,100) < 50)? "deposit" : "withdraw",
					"accountNum" : randomInt(0, 10),
					"bank" : this.randBank(),
					"amount" : randomInt(0, 100)
				}
				this.sendTransaction(transaction, i*2);
			}
		}
	}

	this.createServer();
}

//helper for sending transactions - sends to either head or tail
Client.prototype.sendTransaction = function(transaction, seconds) {
	if(transaction.type == "deposit" || transaction.type == "withdraw")
		this.sendTransactionToHead(transaction.bank, transaction.accountNum, transaction.amount, seconds, transaction.type, transaction.reqId);
	else if(transaction.type == "getBalance")
		this.sendTransactionToTail(transaction.bank, transaction.accountNum, seconds, transaction.type);
}

Client.prototype.sendTransactionToHead = function(bank, accountNum, amount, seconds, type, reqId) {
	var reqId = reqId? reqId : genReqId(bank, accountNum);
	var clientServer = this;

	//get the head, on completion send the request
	this.getHeadFromMaster(bank, function(resObj) {
		setTimeout(function() {
			sendRequest(resObj.ip, resObj.port, {
				reqId 	: reqId,
				type 	: type,
				amount 	: amount,
				accountNum 	: accountNum,
				client : {
					port : clientServer.port,
					ip : clientServer.ip
				}
			}, null);
		}, 1000*seconds);
	});
}

Client.prototype.sendTransactionToTail = function(bank, accountNum, seconds, type) {
	var reqId = genReqId(bank, accountNum);
	var clientServer = this;

	//get the tail, on completion send the request
	this.getTailFromMaster(bank, function(resObj) {
		setTimeout(function() {
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
					console.log("Get Balance Response from tail: " + JSON.stringify(resObj));
				});
			});
		}, 1000*seconds);
	});
}


//helper for getting head, uses callback
Client.prototype.getHeadFromMaster = function(bank, callback) {
	sendRequest(this.master.ip, this.master.port, {
		'type' : 'getHeadForBank',
		'bank' : bank
	}, function (response) {
		getResponseObj(response, callback);
	});
}

//helper for getting tail, uses callback
Client.prototype.getTailFromMaster = function(bank, callback) {
	sendRequest(this.master.ip, this.master.port, {
		'type' : 'getTailForBank',
		'bank' : bank
	}, function (response) {
		getResponseObj(response, callback);
	});
}

//helper for sending request to ip - port
function sendRequest(ip, portNum, reqObj, callback) {
	var options = {
		hostname	: ip,
		port		: portNum,
		method 		: 'POST',
		path 		: '/'
	};
	reqObj['sender'] = reqObj.client;
	if(reqObj.client != null) {
		console.log("\nCLIENT SENDING REQUEST!! : " + JSON.stringify(reqObj) + ": ip: " + ip + ", port: "+ portNum);
	}

	var req = http.request(options, (callback != null)? callback : handleResponse);
	var reqText = JSON.stringify(reqObj);
	req.write(reqText);
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
function genReqId(bank, accountNum) {
	arguments.callee.banks = arguments.callee.banks || [];
	var allBanks = arguments.callee.banks;
	if(allBanks.indexOf(bank) == -1)
		allBanks.push(bank);
	var bnkNum = allBanks.indexOf(bank);

	arguments.callee.count = ++arguments.callee.count || 1
	var reqId = bnkNum + "."  + accountNum + "." + arguments.callee.count;
	return reqId;
}

//#pragma mark - Listening

Client.prototype.createServer = function() {
	console.log("Client: Attempting to listen on: " + this.port);
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
	console.log("\n\nCLIENT RECIEVED: " + JSON.stringify(data) + "\n\n");
}

