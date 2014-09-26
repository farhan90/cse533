//pragma mark - Requires
var http = require('http');

//pragma mark - Public Methods

module.exports = {
  	createBankServer: function(ip, port, name) {
  		return new BankServer(ip, port, name);
  	}
};

//pragma mark - Creating Server

function BankServer(ip, port, name) {
	this.ip = ip;
	this.port = port;
	this.name = name;
	this.accounts = {};
	this.createServer();
}

BankServer.prototype.createServer = function() {
	console.log("Attempting to listen on: " + this.port);
	var bankServer = this;

	http.createServer(function(request, response) {
		var reqData = "";
		request.on('data', function(chunk) {
			reqData += chunk;
		});
		request.on('end', function() {
			console.log("Request Data: " + reqData);
			var reqObj = JSON.parse(reqData);
			recieved(reqObj, response, bankServer);
		});
	}).listen(this.port);
}

BankServer.prototype.toString = function() {
	return "ip: " + this.ip + ", port: " + this.port + ", name: " + this.name;
};

//pragma mark - Bank Handle Methods

function recieved(data, response, bankServer) {
	console.log('recieved: ' + JSON.stringify(data));
	if(data.type == "deposit") {
		deposit(data, response, bankServer);
	}
}

function deposit(data, response, bankServer) {
	var accounts = bankServer.accounts;

	if(accounts[data.accountNum] == null) {
		accounts[data.accountNum] = 0;
		console.log("created account: " + data.accountNum);
	}

	accounts[data.accountNum] += data.amount;

	var resObj = {
		reqId 	: data.reqId,
		outcome : 'Proccessed',
		balance : accounts[data.accountNum]
	};
	response.writeHead(200);
	response.end(JSON.stringify(resObj));
}
