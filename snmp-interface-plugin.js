#!/usr/bin/env node

// Cisco Interface SNMP state toggle
// Copyright (c) 2024 Tamas Simon

// Dependencies to be installed: net-snmp
// npm install net-snmp

// Used OID: 1.3.6.1.2.1.2.2.1.7 - ifAdminStatus
// Params: 
//   device_ip: IPv4 Address
//   snmp_username: string
//   snmp_security_level: menu (noAuthNoPriv,authNoPriv,authPriv)
//   snmp_auth_proto: menu (md5, sha, sha256, sha512)
//   snmp_auth_key: string
//   snmp_priv_proto: menu (des,aes,aes256b,aes256r)
//   snmp_priv_key: string
//   interface_ids: string (cisco-like range syntax, e.q. 1-4,6) (show snmp mib ifmib ifindex)
//   enabled: boolean

var JSONStream = require('pixl-json-stream');
var snmp = require ("net-snmp");

const IPV4REGEX = new RegExp('^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$');
const RANGEREGEX = new RegExp('^(?:[0-9]+(?:\-[0-9]+)?,?)+$');

const engineID = "8000B983805C5CA57BAFB2CAD716E0480B"

// setup stdin / stdout streams 
process.stdin.setEncoding('utf8');
process.stdout.setEncoding('utf8');

var stream = new JSONStream( process.stdin, process.stdout );
stream.on('json', async function(job) {
	// got job from parent 
	var params = job.params;
	
	// Check if supplied device_ip is a correct IPv4 address
	if (!IPV4REGEX.test(params.device_ip)) {
		stream.write({ complete: 1, code: 1, description: "Supplied Device IP is not an IPv4 address. Got: '" + (params.device_ip) + "'" });
		return;
	}
	var deviceIp = params.device_ip;
	
	// Check if wlan_id is Number
	if (!RANGEREGEX.test(params.interface_ids)) {
		stream.write({ complete: 1, code: 1, description: "Supplied Interface ID String has incorrect formatting. Got: '" + (params.wlan_id) + "'" });
		return;
	}
	var interfaceIdString = params.interface_ids;
	
	var snmpOptions = {
		port: 161,
		retries: 1,
		timeout: 5000,
		transport: "udp4",
		trapPort: 162,
		version: snmp.Version3,
		engineID: engineID, // where the X's are random hex digits
		backwardsGetNexts: true,
		reportOidMismatchErrors: false,
		idBitsSize: 32,
		context: ""
	};
	
	var authLevel = getAuthLevel(params.snmp_security_level);
	var authProto = getAuthProtocol(params.snmp_auth_proto);
	var privProto = getPrivProtocol(params.snmp_priv_proto);
	var enabledVal = getEnabledValue(params.enabled);

	// Example user
	var snmpUser = {
		name: params.username,
		level: authLevel,
		authProtocol: authProto,
		authKey: params.snmp_auth_key,
		privProtocol: privProto,
		privKey: params.snmp_priv_key
	};

	var session = snmp.createV3Session (deviceIp, snmpUser, snmpOptions);
	
	var varbinds = [];
	
	var interfaceIds = [];
	
	for (const segment in interfaceIdString.split(',')) {
		if(!segment.includes('-')) {
			interfaceIds.push(segment);
			continue;
		}
		
		const ends = segment.split('-');
		const start = Number(ends[0]);
		const end = Number(ends[1]);
		for (var i = start; i <= end; i++) {
			interfaceIds.push(String(i));
		}
	}
	
	for (const iid in interfaceIds) {
		const oid = `1.3.6.1.2.1.2.2.${iid}.7`;
		const varbind = {
			oid: oid,
			type: snmp.ObjectType.Integer,
			value: enabledVal,
		};
		varbinds.push(varbind);
	}
	
	session.set(varbinds, function (error, varbinds_resp) {
		if (error) {
			stream.write({ complete: 1, code: 1, description: "Error setting OIDs:\n" + error.toString()});
			return;
		}
	});
	
	stream.write({ complete: 1, code: 0, description: "Command executed successfully."});
} ); // stream

function getAuthLevel(authLevel) {
	switch(authLevel) {
		case "noAuthNoPriv":
			return snmp.SecurityLevel.noAuthNoPriv;
		case "authNoPriv":
			return snmp.SecurityLevel.authNoPriv;
		case "authPriv":
			return snmp.SecurityLevel.authPriv;
	}
}

function getAuthProtocol(authProto) {
	switch(authProto) {
		case "md5":
			return snmp.AuthProtocols.md5;
		case "sha":
			return snmp.AuthProtocols.sha;
		case "sha256":
			return snmp.AuthProtocols.sha256;
		case "sha512":
			return snmp.AuthProtocols.sha512;
	}
}

function getPrivProtocol(privProto) {
	switch(privProto) {
		case "des":
			return snmp.PrivProtocols.des;
		case "aes":
			return snmp.PrivProtocols.aes;
		case "aes256b":
			return snmp.PrivProtocols.aes256b;
		case "aes256r":
			return snmp.PrivProtocols.aes256r;
	}
}

function getEnabledValue(enabled) {
	if(enabled) {
		return 1;
	}
	return 2;
}
