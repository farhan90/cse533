//var banks = {}; //dict of key: bankName -> list of alive bankServer's
/*
bankServer {
	ip: ''
	port: ''
}


API:

request w/ {
	type = 'getHeadForBank'
	bank = 'TFCU' (or other bank name)
}
 returns response of {
	'ip' = ip adress of banks head
	'port' = port of banks head
 }

*/

var http = require('http');

module.exports = {
	createMaster: function(banks, port, ip) {
		return new Master(banks, port, ip);
	}
};

function Master(banks, port, ip) {
	this.banks = banks;
	this.port = port;
	this.ip = ip;
	this.createServer();
	return this;
}

Master.prototype.createServer = function() {
	console.log("Master attempting to listen on: " + this.port);
	var master = this;

	http.createServer(function(request, response) {
		var reqData = "";
		request.on('data', function(chunk) {
			reqData += chunk;
		});
		request.on('end', function() {
			var reqObj = JSON.parse(reqData);
			recieved(reqObj, response, master);
		});
	}).listen(this.port);
}

//#pragma mark - response methods

function recieved(data, response, master) {
	if(data.type == "getHeadForBank")
		getHead(data.bank, response, master);
	else if(data.type == "getTailForBank")
		getTail(data.bank, response, master);
	else if(data.type == "getSucAndPred")
		getSucAndPred(data.bank, data.port, data.ip, response, master);
}

getSucAndPred = function(bank, port, ip, response, master) {
	var bankServers = master.banks[bank];
	for(var i = 0; i < bankServers.length; i++) {
		var bs = bankServers[i];
		if(bs.port == port && bs.ip == ip) {
			var suc = null;
			var pred = null;

			suc = bankServers[i+1];
			pred = bankServers[i-1];

			response.writeHead(200);
			response.end(JSON.stringify({
				'suc' 	: suc,
				'pred' 	: pred
			}));
		}
	}
}

getHead = function(bank, response, master) {
	var bankData = master.banks[bank][0];
	var resObj = {
		'ip' : bankData.ip,
		'port' : bankData.port
	};
	response.writeHead(200);
	response.end(JSON.stringify(resObj));
};

getTail = function(bank, response, master) {
	var bankData = master.banks[bank][master.banks[bank].length-1];
	var resObj = {
		'ip' : bankData.ip,
		'port' : bankData.port
	};
	response.writeHead(200);
	response.end(JSON.stringify(resObj));
};
