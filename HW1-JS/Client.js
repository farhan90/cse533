var http = require('http');

module.exports = {
	createClient: function(port, ip, transactions, master) {
		return new Client(port, ip, transactions, master);
	}
};

function Client(port, ip, transactions, master) {
	//transactions list of {type, accountNum, amount, bank}
	this.transactions = transactions;
	this.port = port;
	this.ip = ip;

	//master {ip, port}
	this.master = master;

	for(var i in transactions)
		this.sendTransaction(transactions[i], i*2);

	this.createServer();
}

Client.prototype.sendTransaction = function(transaction, seconds) {
	if(transaction.type == "deposit" || transaction.type == "withdraw")
		this.sendTransactionToHead(transaction.bank, transaction.accountNum, transaction.amount, seconds, transaction.type);
	else if(transaction.type == "getBalance")
		this.sendTransactionToTail(transaction.bank, transaction.accountNum, seconds, transaction.type);
}

Client.prototype.sendTransactionToHead = function(bank, accountNum, amount, seconds, type) {
	var reqId = genReqId(bank, accountNum);
	var clientServer = this;
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

Client.prototype.getHeadFromMaster = function(bank, callback) {
	sendRequest(this.master.ip, this.master.port, {
		'type' : 'getHeadForBank',
		'bank' : bank
	}, function (response) {
		getResponseObj(response, callback);
	});
}

Client.prototype.getTailFromMaster = function(bank, callback) {
	sendRequest(this.master.ip, this.master.port, {
		'type' : 'getTailForBank',
		'bank' : bank
	}, function (response) {
		getResponseObj(response, callback);
	});
}

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
	console.log("Client recieved: " + JSON.stringify(data));
}

