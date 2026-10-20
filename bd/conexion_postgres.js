const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function query(sql, valores, callback) {
  if (typeof valores === "function") {
    callback = valores;
    valores = [];
  }

  var lista = [];
  var n = 0;
  var sqlPostgres = sql.replace(/\?/g, function () {
    var valor = valores[n++];
    if (Array.isArray(valor)) {
      return valor.map(function (v) {
        lista.push(v);
        return "$" + lista.length;
      }).join(", ");
    }
    lista.push(valor);
    return "$" + lista.length;
  });

  pool.query(sqlPostgres, lista, function (err, resultado) {
    if (err) return callback(err);
    var filas = resultado.rows;
    filas.affectedRows = resultado.rowCount;
    callback(null, filas);
  });
}

module.exports = { query: query };