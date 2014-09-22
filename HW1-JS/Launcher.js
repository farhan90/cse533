var Bank = require('./Bank');
var Client = require('./Client');

var config = require('./config.json');

for(var i in config.banks) {
	var bank = config.banks[i];
	console.log("Bank Name: " + bank.name);
	console.log("Bank IP: " + bank.ip);
	console.log("Bank Port: " + bank.port);
	console.log("Bank Chain Length: " + bank.chainLength);

	Bank.createBank(bank.ip, bank.port, bank.name, bank.chainLength);
	console.log("\n");
}

setTimeout(function() {
	console.log("Calling Bank");
	Client.sendRequest('127.0.0.1', 5600, {
		reqId 	: 1,
		type 	: "deposit",
		amount 	: 100,
		act 	: 1
	});
}, 1000*5);
