var bankServer = require('./BankServer');
var client = require('./Client');
var master = require('./Master');
var config = require('./config.json');


//pragma mark - setup banks
var banks = {};
for(var i in config.banks) {
	var bank = config.banks[i];
	banks[bank.name] = [];
	for(var i=0; i<bank.chainLength; i++) {
		var bnk = bankServer.createBankServer(bank.ip, bank.port+i, bank.name);
		banks[bank.name].push(bnk);
	}

	var clients = config.clients;
}

//pragma mark - setup master
var master = master.createMaster(banks);

//pragma mark - setup clients
for(var i in config.clients) {
	var clientData = config.clients[i];
	var c = client.createClient(clientData.transactions, master);
}


