var http = require('http');
var master = require('./Master');

module.exports = {
	createClient: function(transactions, master) {
		return new Client(transactions, master);
	}
};

function Client(transactions, master) {
	//transactions list of {type, accountNum, amount, bank}
	this.transactions = transactions;

	//master {ip, port}
	this.master = master;
	console.log(this.master.toString());

	for(var i in transactions)
		this.sendTransaction(transactions[i], i*2);
}

Client.prototype.sendTransaction = function(transaction, seconds) {
	if(transaction.type == "deposit")
		this.sendDeposit(transaction.bank, transaction.accountNum, transaction.amount, seconds);
};

Client.prototype.sendDeposit = function(bank, accountNum, amount, seconds) {
	var reqId = genReqId(bank, accountNum);
	var addr = this.master.getHead(bank);

	setTimeout(function() {
		sendRequest(addr.ip, addr.port, {
			reqId 	: reqId,
			type 	: "deposit",
			amount 	: amount,
			accountNum 	: accountNum
		});
	}, 1000*seconds);
}

function sendRequest(ip, portNum, reqObj) {
	var options = {
		hostname	: ip,
		port		: portNum,
		method 		: 'POST',
		path 		: '/'
	};

	var req = http.request(options, handleResponse);
	var reqText = JSON.stringify(reqObj);
	req.write(reqText);
	req.end();
}

function handleResponse(response) {
	var serverData = '';
	response.on('data', function(chunk) {
		serverData += chunk;
	});

	response.on('end', function() {
		console.log("Client: Response Data: " + serverData);
	});
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
