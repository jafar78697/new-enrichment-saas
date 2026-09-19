const fs = require('fs');
const file = 'apps/calling-saas/src/pages/LandingPage.tsx';
let code = fs.readFileSync(file, 'utf8');

// Replace features section text
code = code.replace('Everything in rhythm', 'More Information');
code = code.replace('Tools that feel\n                <br />\n                <em>easy to use.</em>', 'What happens after\n                <br />\n                <em>you start?</em>');
code = code.replace('Small details add up: clean data, thoughtful calling tools and a\n              dashboard that tells the truth quickly.', 'Enter your details, use the shared demo calling pool, and upgrade when you are ready to scale.');

// Replace results section text
code = code.replace('The calm behind the numbers', 'Live Call Console');
code = code.replace('When the workflow\n              <br />\n              <em>gets out of the way.</em>', 'Track every conversation\n              <br />\n              <em>from one focused workspace.</em>');
code = code.replace('Your team gets a sharper view of the day: who to call, what to say\n              and what to do next.', 'Monitor active campaigns, dialers, and live voice interactions instantly.');

// Replace stats
code = code.replace('70%', '3');
code = code.replace('less manual prep', 'free demo calls');
code = code.replace('100+', '2');
code = code.replace('hours back each month', 'Maps keyword searches');
code = code.replace('workspace for your team', 'workspace');

// Replace start section
code = code.replace('Ready to test Jento Calling?', 'Ready to test Jento Calling?');
code = code.replace('Make your next\n              <br />\n              <em>call count.</em>', 'Start demo access,\n              <br />\n              <em>then upgrade.</em>');

fs.writeFileSync(file, code);
