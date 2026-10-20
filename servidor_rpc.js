var rpc = require("./rpc.js");
var conexion = require("./bd/conexion_mysql.js");

var servidor = rpc.server(3501, function() {
    console.log("Servidor iniciado...");
});

var app = servidor.createApp("gestion_pacientes");

function obtenerCategorias(callback) {
    conexion.query("SELECT * FROM categorias", function (err, categorias) {
        if (err) return callback([]);
        return callback(categorias);
    });
}

function obtenerModelos(callback) {
    conexion.query("SELECT * FROM modelos", function (err, modelos) {
        if (err) return callback([]);
        return callback(modelos);
    });
}

function loginSanitario(usuario, contraseña, callback) {
    var sql = "SELECT id FROM sanitarios WHERE usuario = ? AND contrasena = ?";
    conexion.query(sql, [usuario, contraseña], function (err, sanitarios) {
        if (err || sanitarios.length === 0) return callback(null);
        return callback(sanitarios[0].id);
    });
}

function crearSanitario(nombre, apellidos, usuario, contraseña, callback) {
    // La tabla no tiene UNIQUE en usuario: se comprueba aqui que el login no exista
    conexion.query("SELECT id FROM sanitarios WHERE usuario = ?", [usuario], function (err, duplicados) {
        if (err || duplicados.length > 0) return callback(null); // usuario duplicado u otro error

        var sql = "INSERT INTO sanitarios (nombre, apellidos, usuario, contrasena) VALUES (?, ?, ?, ?)";
        conexion.query(sql, [nombre, apellidos, usuario, contraseña], function (err, resultado) {
            if (err) return callback(null);
            return callback(resultado.insertId);
        });
    });
}

function editarDatos(idSanitario, datosSanitario, callback) {
    conexion.query("SELECT id FROM sanitarios WHERE id = ?", [idSanitario], function (err, encontrados) {
        if (err || encontrados.length === 0) return callback(null);

        var sqlDuplicado = "SELECT id FROM sanitarios WHERE usuario = ? AND id != ?";
        conexion.query(sqlDuplicado, [datosSanitario.usuario, idSanitario], function (err, duplicados) {
            if (err || duplicados.length > 0) return callback(null);

            var sqlUpdate = "UPDATE sanitarios SET nombre = ?, apellidos = ?, usuario = ?, contrasena = ? WHERE id = ?";
            var valores = [datosSanitario.nombre, datosSanitario.apellidos, datosSanitario.usuario, datosSanitario.contraseña, idSanitario];
            conexion.query(sqlUpdate, valores, function (err) {
                if (err) return callback(null);
                return callback(true);
            });
        });
    });
}


function obtenerSanitario(idSanitario, callback) {
    var sql = "SELECT nombre, apellidos, usuario FROM sanitarios WHERE id = ?";
    conexion.query(sql, [idSanitario], function (err, sanitarios) {
        if (err || sanitarios.length === 0) return callback(null);
        return callback(sanitarios[0]);
    });
}

function obtenerRecursos(idModelo, callback) {
    var sql = "SELECT * FROM recursos WHERE modelo = ? AND estado = 0";
    conexion.query(sql, [idModelo], function (err, recursos) {
        if (err) return callback([]);
        return callback(recursos);
    });
}

function obtenerRecurso(idRecurso, callback) {
    conexion.query("SELECT * FROM recursos WHERE id = ?", [idRecurso], function (err, recursos) {
        if (err || recursos.length === 0) return callback(null);
        return callback(recursos[0]);
    });
}

// Calcula, para una reserva pendiente (sin fecha_inicio), las horas restantes
// del uso activo actual del mismo recurso (si lo hay), igual que en la version en memoria.
function calcularHorasRestantesPendiente(idRecurso, callback) {
    var sql = "SELECT fecha_inicio, horas_estimadas FROM reservas " +
        "WHERE recurso = ? AND fecha_inicio IS NOT NULL AND fecha_fin IS NULL LIMIT 1";
    conexion.query(sql, [idRecurso], function (err, activas) {
        if (err || activas.length === 0) return callback(0);
        var ahora = new Date();
        var finEstimado = new Date(activas[0].fecha_inicio.getTime() + activas[0].horas_estimadas * 3600000);
        var diff = (finEstimado - ahora) / 3600000;
        return callback(diff > 0 ? parseFloat(diff.toFixed(1)) : 0);
    });
}

function obtenerReservas(idSanitario, callback) {
    var sql = "SELECT r.id, r.recurso, r.horas_estimadas, r.fecha_peticion, r.fecha_inicio, r.fecha_fin, " +
        "c.nombre AS categoria, m.nombre AS modelo, u.nombre AS ubicacion, rec.numero_serie " +
        "FROM reservas r " +
        "LEFT JOIN recursos rec ON rec.id = r.recurso " +
        "LEFT JOIN categorias c ON c.id = rec.categoria " +
        "LEFT JOIN modelos m ON m.id = rec.modelo " +
        "LEFT JOIN ubicaciones u ON u.id = rec.ubicacion " +
        "WHERE r.sanitario = ?";

    conexion.query(sql, [idSanitario], function (err, filas) {
        if (err) return callback([]);
        rellenarHorasRestantes(filas, 0, callback);
    });
}

function rellenarHorasRestantes(filas, indice, callback) {
    if (indice >= filas.length) return callback(filas);

    var reserva = filas[indice];
    reserva.categoria = reserva.categoria || "-";
    reserva.modelo = reserva.modelo || "-";
    reserva.ubicacion = reserva.ubicacion || "-";
    reserva.numero_serie = reserva.numero_serie || "-";
    reserva.horas_restantes = 0;

    if (reserva.fecha_inicio != null) {
        return rellenarHorasRestantes(filas, indice + 1, callback);
    }

    calcularHorasRestantesPendiente(reserva.recurso, function (horas) {
        reserva.horas_restantes = horas;
        rellenarHorasRestantes(filas, indice + 1, callback);
    });
}

function obtenerResenyas(idRecurso, callback) {
    conexion.query("SELECT * FROM resenyas WHERE recurso = ?", [idRecurso], function (err, resenyas) {
        if (err) return callback([]);
        return callback(resenyas);
    });
}

function obtenerRecursosDisponibles(idModelo, callback) {
    var sql = "SELECT rec.id, rec.numero_serie, u.nombre AS ubicacion " +
        "FROM recursos rec LEFT JOIN ubicaciones u ON u.id = rec.ubicacion " +
        "WHERE rec.modelo = ? AND rec.estado = 0";

    conexion.query(sql, [idModelo], function (err, recursos) {
        if (err) return callback([]);
        rellenarDisponibilidad(recursos, 0, callback);
    });
}

function rellenarDisponibilidad(recursos, indice, callback) {
    if (indice >= recursos.length) return callback(recursos);

    var rec = recursos[indice];

    conexion.query(
        "SELECT AVG(valor) AS media, COUNT(*) AS total FROM resenyas WHERE recurso = ?",
        [rec.id],
        function (err, valoracion) {
            rec.valoracion = (!err && valoracion[0].total > 0) ? Number(valoracion[0].media).toFixed(1) : "-";

            var sqlActiva = "SELECT fecha_inicio, horas_estimadas FROM reservas " +
                "WHERE recurso = ? AND fecha_inicio IS NOT NULL AND fecha_fin IS NULL LIMIT 1";
            conexion.query(sqlActiva, [rec.id], function (err, activas) {
                rec.horas_restantes = "Disponible";
                if (!err && activas.length > 0) {
                    var ahora = new Date();
                    var finEstimado = new Date(activas[0].fecha_inicio.getTime() + activas[0].horas_estimadas * 3600000);
                    var diff = (finEstimado - ahora) / 3600000;
                    rec.horas_restantes = diff > 0 ? diff.toFixed(1) : "Disponible";
                }
                rellenarDisponibilidad(recursos, indice + 1, callback);
            });
        }
    );
}

function reservarRecurso(idRecurso, idSanitario, horasEstimadas, callback) {
    conexion.query("SELECT id FROM recursos WHERE id = ?", [idRecurso], function (err, recursos) {
        if (err || recursos.length === 0) return callback(null);

        var sql = "INSERT INTO reservas (recurso, sanitario, horas_estimadas, fecha_peticion, fecha_inicio, fecha_fin) " +
            "VALUES (?, ?, ?, NOW(), NULL, NULL)";
        conexion.query(sql, [idRecurso, idSanitario, horasEstimadas], function (err, resultado) {
            if (err) return callback(null);
            return callback(resultado.insertId);
        });
    });
}

function iniciarReserva(idReserva, callback) {
    conexion.query("SELECT recurso FROM reservas WHERE id = ?", [idReserva], function (err, objetivo) {
        if (err || objetivo.length === 0) return callback(null);
        var idRecurso = objetivo[0].recurso;

        var sql = "SELECT id, fecha_inicio, horas_estimadas FROM reservas " +
            "WHERE recurso = ? AND fecha_inicio IS NOT NULL AND fecha_fin IS NULL AND id != ?";
        conexion.query(sql, [idRecurso, idReserva], function (err, activas) {
            if (err) return callback(null);
            comprobarYcerrarActivas(activas, 0, idReserva, callback);
        });
    });
}

// Revisa las reservas activas del mismo recurso: si alguna sigue con tiempo, no se puede
// iniciar (callback(null)); si ya agoto su tiempo, se cierra (fecha_fin = ahora) y se sigue.
function comprobarYcerrarActivas(activas, indice, idReserva, callback) {
    if (indice >= activas.length) {
        conexion.query("UPDATE reservas SET fecha_inicio = NOW() WHERE id = ?", [idReserva], function (err) {
            if (err) return callback(null);
            return callback(true);
        });
        return;
    }

    var r = activas[indice];
    var ahora = new Date();
    var finEstimado = new Date(r.fecha_inicio.getTime() + r.horas_estimadas * 3600000);

    if (ahora < finEstimado) {
        return callback(null); // recurso aun en uso con tiempo restante
    }

    conexion.query("UPDATE reservas SET fecha_fin = ? WHERE id = ?", [ahora, r.id], function (err) {
        if (err) return callback(null);
        comprobarYcerrarActivas(activas, indice + 1, idReserva, callback);
    });
}

function finalizarReserva(idReserva, callback) {
    conexion.query("UPDATE reservas SET fecha_fin = NOW() WHERE id = ?", [idReserva], function (err, resultado) {
        if (err || resultado.affectedRows === 0) return callback(null);
        return callback(true);
    });
}

function cancelarReserva(idReserva, callback) {
    conexion.query("DELETE FROM reservas WHERE id = ?", [idReserva], function (err, resultado) {
        if (err || resultado.affectedRows === 0) return callback(null);
        return callback(true);
    });
}

function crearResenya(idRecurso, idSanitario, valoracion, descripcion, callback) {
    var sql = "INSERT INTO resenyas (recurso, sanitario, fecha, valor, descripcion) VALUES (?, ?, NOW(), ?, ?)";
    conexion.query(sql, [idRecurso, idSanitario, valoracion, descripcion], function (err, resultado) {
        if (err) return callback(null);
        return callback(resultado.insertId);
    });
}

function tiempoPendiente(idRecurso, callback) {
    calcularHorasRestantesPendiente(idRecurso, function (horas) {
        return callback(horas);
    });
}

function calcularTiempoReserva(idReserva, callback) {
    conexion.query("SELECT fecha_inicio, fecha_fin FROM reservas WHERE id = ?", [idReserva], function (err, reservas) {
        if (err || reservas.length === 0 || reservas[0].fecha_fin == null) return callback(null);
        var tiempoEnHoras = (reservas[0].fecha_fin - reservas[0].fecha_inicio) / (1000 * 60 * 60);
        return callback(tiempoEnHoras);
    });
}

function contarReservasPendientes(callback) {
    var sql = "SELECT COUNT(*) AS total FROM reservas WHERE fecha_peticion IS NOT NULL AND fecha_inicio IS NULL";
    conexion.query(sql, function (err, filas) {
        if (err) return callback(0);
        return callback(filas[0].total);
    });
}

function duplicarReserva(idReserva, callback) {
    var sql = "SELECT recurso, sanitario, horas_estimadas FROM reservas WHERE id = ?";
    conexion.query(sql, [idReserva], function (err, reservas) {
        if (err || reservas.length === 0) return callback(null);
        var r = reservas[0];

        var sqlInsert = "INSERT INTO reservas (recurso, sanitario, horas_estimadas, fecha_peticion, fecha_inicio, fecha_fin) " +
            "VALUES (?, ?, ?, NOW(), NULL, NULL)";
        conexion.query(sqlInsert, [r.recurso, r.sanitario, r.horas_estimadas], function (err) {
            if (err) return callback(null);
            return callback(true);
        });
    });
}

function obtenerSanitariosPendientes(idRecurso, callback) {
    var sql = "SELECT sanitario FROM reservas WHERE recurso = ? AND fecha_inicio IS NULL";
    conexion.query(sql, [idRecurso], function (err, filas) {
        if (err) return callback([]);
        return callback(filas.map(function (fila) { return fila.sanitario; }));
    });
}

// Retorna todos los sanitarios con reserva no finalizada (fecha_fin==null) del recurso,
// excluyendo al sanitario que realiza la accion.
function obtenerSanitariosNoFinalizados(idRecurso, idSanitarioExcluir, callback) {
    var sql = "SELECT DISTINCT sanitario FROM reservas WHERE recurso = ? AND fecha_fin IS NULL AND sanitario != ?";
    conexion.query(sql, [idRecurso, idSanitarioExcluir], function (err, filas) {
        if (err) return callback([]);
        return callback(filas.map(function (fila) { return fila.sanitario; }));
    });
}

app.registerAsync("obtenerCategorias", obtenerCategorias);
app.registerAsync("obtenerModelos", obtenerModelos);
app.registerAsync("loginSanitario", loginSanitario);
app.registerAsync("crearSanitario", crearSanitario);
app.registerAsync("editarDatos", editarDatos);
app.registerAsync("obtenerSanitario", obtenerSanitario);
app.registerAsync("obtenerRecursos", obtenerRecursos);
app.registerAsync("obtenerRecurso", obtenerRecurso);
app.registerAsync("obtenerReservas", obtenerReservas);
app.registerAsync("obtenerResenyas", obtenerResenyas);
app.registerAsync("obtenerRecursosDisponibles", obtenerRecursosDisponibles);
app.registerAsync("reservarRecurso", reservarRecurso);
app.registerAsync("iniciarReserva", iniciarReserva);
app.registerAsync("finalizarReserva", finalizarReserva);
app.registerAsync("cancelarReserva", cancelarReserva);
app.registerAsync("crearResenya", crearResenya);
app.registerAsync("tiempoPendiente", tiempoPendiente);
app.registerAsync("calcularTiempoReserva", calcularTiempoReserva);
app.registerAsync("contarReservasPendientes", contarReservasPendientes);
app.registerAsync("duplicarReserva", duplicarReserva);
app.registerAsync("obtenerSanitariosPendientes", obtenerSanitariosPendientes);
app.registerAsync("obtenerSanitariosNoFinalizados", obtenerSanitariosNoFinalizados);
