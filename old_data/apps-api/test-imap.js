const Imap = require('imap');

const imap = new Imap({
  user: 'alaf4083@gmail.com',
  password: 'txgdhbqlvlqbwxhy',
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
  connTimeout: 20000,
  authTimeout: 10000
});

imap.once('ready', () => {
  console.log("IMAP connected!");
  imap.openBox('INBOX', true, (err, box) => {
    if (err) throw err;
    const since = new Date();
    since.setDate(since.getDate() - 2);
    
    console.log("Searching since:", since);
    imap.search([['SINCE', since]], (err2, uids) => {
      if (err2) throw err2;
      console.log("Found UIDs:", uids.length);
      if (uids.length === 0) {
        imap.end();
        return;
      }
      
      const fetch = imap.fetch(uids.slice(-50), { bodies: ['HEADER'], struct: true });
      fetch.on('message', (msg, seqno) => {
        let headerBuffer = '';
        msg.on('body', (stream, info) => {
          stream.on('data', chunk => headerBuffer += chunk.toString());
          stream.once('end', () => {
            const fromMatch = headerBuffer.match(/^From:\s*(.+)$/im);
            const subjectMatch = headerBuffer.match(/^Subject:\s*(.+)$/im);
            
            const fromEmailRaw = fromMatch ? fromMatch[1] : '';
            const fromEmail = fromEmailRaw.replace(/.*<(.+)>.*/, '$1').trim();
            const subject = subjectMatch ? subjectMatch[1] : 'Unknown';
            console.log(`Msg #${seqno} - FromRaw: ${fromEmailRaw} -> Extracted: ${fromEmail} | Subject: ${subject}`);
          });
        });
      });
      fetch.once('end', () => imap.end());
    });
  });
});

imap.once('error', err => {
  console.log("IMAP error:", err);
});

imap.once('end', () => {
  console.log("IMAP connection ended");
});

imap.connect();
