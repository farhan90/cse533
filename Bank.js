var http = require('http');

process.argv.forEach(function (val, index, array) {
  	console.log(index + ': ' + val);
  	if(index > 1) {
  		setupBank('TFCU', val);
  	}
});

function setupBank(bankName, portNumber) {
	console.log('In setup bank: ' + portNumber);
	var accounts = {};

	function handleRequest(req, res) {

	}

	var server =  http.createServer(handleRequest);
	server.listen(8080);
}