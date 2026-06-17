/**
 * PATSCompare
 * currentDateTime.js
 * Utility function to formate the current date and time as DD/MM/YY HH:MM:SS
 * (c) PATS Technologies
 */
export function currentDateTime() {
  const agora = new Date();

  const dia   = String(agora.getDate()).padStart(2, '0');
  const mes   = String(agora.getMonth() + 1).padStart(2, '0'); // meses 0–11
  const ano   = String(agora.getFullYear()).slice(-2);
  const hora  = String(agora.getHours()).padStart(2, '0');
  const min   = String(agora.getMinutes()).padStart(2, '0');
  const seg   = String(agora.getSeconds()).padStart(2, '0');

  return `${dia}/${mes}/${ano} ${hora}:${min}:${seg}`;
}
