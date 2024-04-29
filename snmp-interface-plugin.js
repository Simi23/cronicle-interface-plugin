#!/usr/bin/env node

// Cisco Interface SNMP state toggle V2C
// Copyright (c) 2024 Tamas Simon

// Dependencies to be installed: net-snmp
// npm install net-snmp

// Used OID: 1.3.6.1.2.1.2.2.1.7 - ifAdminStatus
// Params: 
//   device_ip: IPv4 Address
//   snmp_community: string
//   interface_ids: string (cisco-like range syntax, e.q. 1-4,6) (show snmp mib ifmib ifindex)
//   enabled: boolean

var JSONStream = require('pixl-json-stream');
var snmp = require ("net-snmp");

const IPV4REGEX = new RegExp('^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$');
const RANGEREGEX = new RegExp('^(?:[0-9]+(?:\-[0-9]+)?,?)+$');

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
		stream.write({ complete: 1, code: 1, description: "Supplied Interface ID String has incorrect formatting. Got: '" + (params.interface_ids) + "'" });
		return;
	}
	var interfaceIdString = params.interface_ids;
	var enabledVal = getEnabledValue(params.enabled);
	var session = snmp.createSession(deviceIp, params.snmp_community);
	var varbinds = [];
	
	var interfaceIds = [];
	const splitIds = interfaceIdString.split(',');
	for (var i = 0; i < splitIds.length; i++) {
		const segment = splitIds[i];
		if(!segment.includes('-')) {
			interfaceIds.push(segment);
			continue;
		}
		
		const ends = segment.split('-');
		const start = Number(ends[0]);
		const end = Number(ends[1]);
		for (var j = start; j <= end; j++) {
			interfaceIds.push(String(j));
		}
	}
	console.log(interfaceIds);
	for (var i = 0; i < interfaceIds.length; i++) {
		const iid = interfaceIds[i];
		const oid = `1.3.6.1.2.1.2.2.${iid}.7`;
		const varbind = {
			oid: oid,
			type: snmp.ObjectType.Integer,
			value: enabledVal,
		};
		varbinds.push(varbind);
	}
	console.log(snmpUser);
	console.log(varbinds);
	await SetSNMP(session, varbinds, stream);
	
	stream.write({ complete: 1, code: 0, description: "Command executed successfully."});
} ); // stream

async function SetSNMP(session, varbinds, stream) {
	return new Promise(resolve => {
		session.set(varbinds, function (error, varbinds_resp) {
			if (error) {
				stream.write({ complete: 1, code: 1, description: "Error setting OIDs:\n" + error.toString()});
				resolve();
				return;
			}
			session.close();
			resolve();
		});
	});	
}

function getEnabledValue(enabled) {
	if(enabled) {
		return 1;
	}
	return 2;
}
