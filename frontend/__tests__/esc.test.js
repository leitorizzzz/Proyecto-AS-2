/**
 * esc() de frontend/app.js (auditoria SQA, 26 oct): debe escapar tambien
 * las comillas. Sin eso un apellido como  x" autofocus onfocus="...
 * cerraba el value="..." del dialogo Editar paciente e inyectaba codigo
 * (XSS almacenado, verificado en el navegador). app.js es un script de
 * navegador; aqui se extrae solo la funcion.
 */
const fs = require('fs');
const path = require('path');

const fuente = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const def = fuente.match(/function esc\(s\) \{[\s\S]*?\n\}/);
// eslint-disable-next-line no-new-func
const esc = new Function(`${def[0]}; return esc;`)();

describe('esc()', () => {
  test('escapa los 5 caracteres especiales de HTML', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
  test('un valor con comillas no puede salir del atributo', () => {
    const html = `<input value="${esc('x" autofocus onfocus="alert(1)')}">`;
    expect(html).toBe('<input value="x&quot; autofocus onfocus=&quot;alert(1)">');
    expect(html.match(/"/g)).toHaveLength(2);
  });
  test('null / undefined -> cadena vacía; tildes y ñ intactas', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc('José Ñoño')).toBe('José Ñoño');
  });
});
