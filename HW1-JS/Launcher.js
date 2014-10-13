var bankServer = require('./BankServer');
var client = require('./Client');
var master = require('./Master');
var config = ''

//arguments
process.argv.forEach(function (val, index, array) {
	console.log(index + ': ' + val);
	if(index == 2)
		config = './' + val;
});
if(config == '') 
	config = './config.json';
config = require(config);

//pragma mark - setup banks
var banks = {};
var bankServers = {};
var bankNames = [];
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
		bankNames.push(bank.name);
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
	console.log(clientData.random);
	var c = client.createClient(clientData.port, clientData.ip, clientData.transactions, clientData.random, config.master, bankNames);
}


