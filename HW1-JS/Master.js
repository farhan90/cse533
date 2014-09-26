//var banks = {}; //dict of key: bankName -> list of alive bankServer's
/*
bankServer {
	ip: ''
	port: ''
}
*/

module.exports = {
	createMaster: function(banks) {
		return new Master(banks);
	}
};

function Master(banks) {
	this.banks = banks;
	return this;
}

Master.prototype.getHead = function(bank) {
	return this.banks[bank][0];
};

Master.prototype.toString = function() {
	var txt = "";
	for(var i in this.banks) {
		txt += this.banks[i].toString() + "\n";
	}
	return txt;
};
