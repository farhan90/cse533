var bankServer = require('./BankServer');
var client = require('./Client');
var master = require('./Master');
var config = require('./config.json');

//pragma mark - setup banks
var banks = {};
var bankServers = {};
for(var i in config.banks) {
	var bank = config.banks[i];
	banks[bank.name] = [];
	bankServers[bank.name] = [];
	for(var i=0; i<bank.chainLength; i++) {
		var bnk = bankServer.createBankServer(bank.ip, bank.port+i, bank.name, config.master);
		banks[bank.name].push({
			"port" 	: bnk.port,
			"ip" 	: bnk.ip
		});
		bankServers[bank.name].push(bnk);
	}
}

//pragma mark - setup master
var master = master.createMaster(banks, config.master.port, config.master.ip);
for(var bankName in bankServers) {
	var bank = bankServers[bankName];
	for(var j in bank) {
		var bankServer = bank[j];
		bankServer.getSucAndPred();
	}
}

//pragma mark - setup clients
for(var i in config.clients) {
	var clientData = config.clients[i];
	var c = client.createClient(clientData.port, clientData.ip, clientData.transactions, config.master);
}


