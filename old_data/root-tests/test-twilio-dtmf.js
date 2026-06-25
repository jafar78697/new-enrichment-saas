const { twilioClient } = require('./apps/api/src/calls-module/config/twilio.js');
console.log(Object.keys(twilioClient.calls('fake-sid')));
