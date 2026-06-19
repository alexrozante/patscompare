/**
 * PATSCompare
 * sysout.js
 * Utility function to save messages into database log table and/or display into server console
 * (c) PATS Technologies
 */
import { currentDateTime } from './currentDateTime.js';

/**
 * Writes a message to database log table and/or displays in the server console
 * @param {*} module code piece to improve traceability
 * @param {*} type 'I' for Information, 'E' for Error
 * @param {*} message text to save and/or display
 * @param {*} error true to display the message using console.error(). Defaults to false = display using console.log()
 * @returns true
 */
export function sysout(module, type, message, error=false) {

  const now = currentDateTime();
  const strModule = String(module).padEnd(20);
  const strMsg = String(message);
  const strMessage = strMsg.length > 120 ? strMsg.slice(0,120).concat('...') : strMsg;
  if (error)
    console.error(`${now} [${type}][${strModule}]: ${strMessage}`);
  else
    console.log(`${now} [${type}][${strModule}]: ${strMessage}`);

  return true;
}
