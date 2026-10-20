var express = require("express");
var jwt = require("jwt-simple");
var clave = "miSecretoMasOscuro";
var app = express();

var conexion;
if (process.env.DATABASE_URL) {
  conexion = require("./bd/conexion_postgres.js");
} else {
  conexion = require("./bd/conexion_mysql.js");
}

app.use("/appCliente", express.static("cliente_rest"));
app.use(express.json());


app.post("/api/gestores/login", (req, res) => {
  var usuario = req.body.usuario;
  var contraseña = req.body.contraseña;

  var sql = "SELECT id FROM gestores WHERE usuario = ? AND contrasena = ?";
  conexion.query(sql, [usuario, contraseña], function (err, gestores) {
    if (err) {
      console.log("Error al realizar la select", err);
      return res.status(500).json("Error al realizar la consulta");
    }
    if (gestores.length === 1) {
      var contenido = {
        usuario: gestores[0].id,
        expira: Date.now() + 60 * 60 * 1000
      };
      var token = jwt.encode(contenido, clave);
      res.status(200).json({ id: gestores[0].id, token: token });
    } else {
      res.status(403).json("Credenciales incorrectas.");
    }
  });
});

app.post("/api/gestores", function (req, res) {
  var sql = "INSERT INTO gestores (nombre, apellidos, usuario, contrasena) VALUES (?, ?, ?, ?)";
  var valores = [req.body.nombre, req.body.apellidos, req.body.usuario, req.body.contraseña];

  // La tabla no tiene UNIQUE en usuario: se comprueba aqui que el login no exista
  conexion.query("SELECT id FROM gestores WHERE usuario = ?", [req.body.usuario], function (err, duplicados) {
    if (err) {
      console.log("Error al realizar la select", err);
      return res.status(500).json("Error al realizar la consulta");
    }
    if (duplicados.length > 0) {
      return res.status(409).json("El login ya existe");
    }

    conexion.query(sql, valores, function (err, resultado) {
      if (err) {
        console.log("Error al realizar el insert", err);
        res.status(500).json("Error al realizar la insercion");
      } else {
        res.status(201).json("Gestor añadido correctamente a la base de datos.");
      }
    });
  });
});

app.use("/api", function (req, res, next) {
  var token = req.query.token;
  if (!token) {
    return res.status(401).json("No se ha encontrado token");
  }

  try {
    var contenidoToken = jwt.decode(token, clave);
  } catch (error) {
    return res.status(401).json("El token es incorrecto");
  }

  if (!contenidoToken || !contenidoToken.expira || !contenidoToken.usuario) {
    return res.status(401).json("El formato del token no es adecuado");
  }

  if (contenidoToken.expira < Date.now()) {
    return res.status(401).json("El token ha expirado");
  }
  next();
});


app.get("/api/ubicaciones", (req, res) => {
  conexion.query("SELECT * FROM ubicaciones", function (err, ubicaciones) {
    if (err) {
      console.log("Error al realizar la select", err);
      res.status(500).json("Error al realizar la consulta");
    } else {
      res.status(200).json(ubicaciones);
    }
  });
});

app.get("/api/categorias", (req, res) => {
  conexion.query("SELECT * FROM categorias", function (err, categorias) {
    if (err) {
      console.log("Error al realizar la select", err);
      res.status(500).json("Error al realizar la consulta");
    } else {
      res.status(200).json(categorias);
    }
  });
});

app.get("/api/modelos", (req, res) => {
  conexion.query("SELECT * FROM modelos", function (err, modelos) {
    if (err) {
      console.log("Error al realizar la select", err);
      res.status(500).json("Error al realizar la consulta");
    } else {
      res.status(200).json(modelos);
    }
  });
});

app.get("/api/estados", (req, res) => {
  conexion.query("SELECT * FROM estado ORDER BY id", function (err, estados) {
    if (err) {
      console.log("Error al realizar la select", err);
      res.status(500).json("Error al realizar la consulta");
    } else {
      res.status(200).json(estados);
    }
  });
});

app.post("/api/area_salud", function (req,res){
  var sql = "INSERT INTO area_salud (codigo_postal, nombre, gestor) VALUES (?,?,?)";
  var valores = [req.body.codigo_postal, req.body.nombre, req.body.gestor];

  conexion.query(sql, valores, function (err, area) {
    if (err) {
      console.log("Error al realizar el insert", err);
      res.status(500).json("Error al realizar la insercion");
    } else {
      res.status(201).json(area);
    }
  });
});


app.put("/api/gestores/:id", function (req, res) {
  var idGestor = parseInt(req.params.id);
  var gestor = {
    nombre: req.body.nombre,
    apellidos: req.body.apellidos,
    usuario: req.body.usuario,
    contraseña: req.body.contraseña
  };

  conexion.query("SELECT id FROM gestores WHERE id = ?", [idGestor], function (err, encontrados) {
    if (err) {
      console.log("Error al realizar la select", err);
      return res.status(500).json("Error al realizar la consulta");
    }
    if (encontrados.length === 0) {
      return res.status(404).json("El usuario que está intentando modificar no se encuentra en la base de datos");
    }

    var sqlDuplicado = "SELECT id FROM gestores WHERE usuario = ? AND id != ?";
    conexion.query(sqlDuplicado, [gestor.usuario, idGestor], function (err, duplicados) {
      if (err) {
        console.log("Error al realizar la select", err);
        return res.status(500).json("Error al realizar la consulta");
      }
      if (duplicados.length > 0) {
        return res.status(404).json("El login ya existe");
      }

      var sqlUpdate = "UPDATE gestores SET nombre = ?, apellidos = ?, usuario = ?, contrasena = ? WHERE id = ?";
      var valores = [gestor.nombre, gestor.apellidos, gestor.usuario, gestor.contraseña, idGestor];
      conexion.query(sqlUpdate, valores, function (err) {
        if (err) {
          console.log("Error al realizar el update", err);
          return res.status(500).json("Error al realizar la actualización");
        }
        res.status(201).json("Se han actualizado correctamente los datos.");
      });
    });
  });
});

app.get("/api/gestores/:id", function (req, res) {
  var idGestor = parseInt(req.params.id);
  var sql = "SELECT id, nombre, apellidos, usuario FROM gestores WHERE id = ?";

  conexion.query(sql, [idGestor], function (err, gestores) {
    if (err) {
      console.log("Error al realizar la select", err);
      return res.status(500).json("Error al realizar la consulta");
    }
    if (gestores.length === 0) {
      return res.status(404).json("Gestor no encontrado.");
    }
    res.status(200).json(gestores[0]);
  });
});

app.get("/api/sanitarios/:id", function (req, res) {
  var idSanitario = parseInt(req.params.id);
  var sql = "SELECT id, nombre, apellidos, usuario FROM sanitarios WHERE id = ?";

  conexion.query(sql, [idSanitario], function (err, sanitarios) {
    if (err) {
      console.log("Error al realizar la select", err);
      return res.status(500).json("Error al realizar la consulta");
    }
    if (sanitarios.length === 0) {
      return res.status(404).json("Sanitario no encontrado.");
    }
    res.status(200).json(sanitarios[0]);
  });
});

app.get("/api/recursos", function (req, res) {
  var categoria = req.query.categoria;
  var modelo = req.query.modelo;
  var ubicacion = req.query.ubicacion;
  var estadoFiltro = req.query.estado;

  var sql = "SELECT * FROM recursos WHERE 1 = 1";
  var valores = [];

  if (categoria) {
    sql += " AND categoria = ?";
    valores.push(categoria);
  }
  if (modelo) {
    sql += " AND modelo = ?";
    valores.push(modelo);
  }
  if (ubicacion) {
    sql += " AND ubicacion = ?";
    valores.push(ubicacion);
  }
  if (estadoFiltro !== undefined && estadoFiltro !== "" && estadoFiltro !== "-1") {
    sql += " AND estado = ?";
    valores.push(estadoFiltro);
  }

  conexion.query(sql, valores, function (err, recursos) {
    if (err) {
      console.log("Error al realizar la select", err);
      return res.status(500).json("Error al realizar la consulta");
    }
    res.status(200).json(recursos);
  });
});

app.get("/api/recursos/:id", function (req, res) {
  var idBusqueda = parseInt(req.params.id);
  var sql = "SELECT * FROM recursos WHERE numero_serie = ? OR id = ?";

  conexion.query(sql, [idBusqueda, idBusqueda], function (err, recursos) {
    if (err) {
      console.log("Error al realizar la select", err);
      return res.status(500).json("Error al realizar la consulta");
    }
    if (recursos.length === 0) {
      return res.status(404).json("Recurso no encontrado.");
    }
    res.status(200).json(recursos[0]);
  });
});

app.post("/api/recursos", function (req, res) {
  // La categoria se toma del modelo elegido (modelos.categoria)
  var sql = "INSERT INTO recursos (categoria, modelo, ubicacion, numero_serie, estado) " +
    "VALUES ((SELECT categoria FROM modelos WHERE id = ?), ?, ?, ?, ?)";
  var numSerie = parseInt(req.body.numero_serie);
  var valores = [req.body.modelo, req.body.modelo, req.body.ubicacion, numSerie, req.body.estado];

  // La tabla no tiene UNIQUE en numero_serie: se comprueba aqui que no exista
  conexion.query("SELECT id FROM recursos WHERE numero_serie = ?", [numSerie], function (err, duplicados) {
    if (err) {
      console.log("Error al realizar la select", err);
      return res.status(500).json("Error al realizar la consulta");
    }
    if (duplicados.length > 0) {
      return res.status(409).json("Ya existe un recurso con ese número de serie");
    }

    conexion.query(sql, valores, function (err, resultado) {
      if (err) {
        console.log("Error al realizar el insert", err);
        res.status(500).json("Error al realizar la insercion");
      } else {
        res.status(201).json("Recurso añadido correctamente a la base de datos.");
      }
    });
  });
});

app.put("/api/recursos/:id", function (req, res) {
  var numSerie = parseInt(req.params.id);
  // Si cambia el modelo, la categoria se actualiza con la de ese modelo
  var sql = "UPDATE recursos SET categoria = (SELECT categoria FROM modelos WHERE id = ?), " +
    "modelo = ?, ubicacion = ?, estado = ? WHERE numero_serie = ?";
  var valores = [req.body.modelo, req.body.modelo, req.body.ubicacion, req.body.estado, numSerie];

  conexion.query(sql, valores, function (err, resultado) {
    if (err) {
      console.log("Error al realizar el update", err);
      return res.status(500).json("Error al realizar la actualización");
    }
    if (resultado.affectedRows > 0) {
      res.status(200).json("El recurso se ha actualizado en la base de datos.");
    } else {
      res.status(404).json("Error actualizando el recurso.");
    }
  });
});

app.get("/api/recursos/:id/reservas", function (req, res) {
  var idRecurso = parseInt(req.params.id);
  conexion.query("SELECT * FROM reservas WHERE recurso = ?", [idRecurso], function (err, reservas) {
    if (err) {
      console.log("Error al realizar la select", err);
      return res.status(500).json("Error al realizar la consulta");
    }
    res.status(200).json(reservas);
  });
});

app.get("/api/recursos/:id/resenyas", function (req, res) {
  var idRecurso = parseInt(req.params.id);
  conexion.query("SELECT * FROM resenyas WHERE recurso = ?", [idRecurso], function (err, resenyas) {
    if (err) {
      console.log("Error al realizar la select", err);
      return res.status(500).json("Error al realizar la consulta");
    }
    res.status(200).json(resenyas);
  });
});

app.delete("/api/recursos/:id", function (req, res) {
  var idRecursoOSerie = parseInt(req.params.id);

  conexion.query("SELECT id FROM recursos WHERE numero_serie = ? OR id = ?", [idRecursoOSerie, idRecursoOSerie], function (err, recursos) {
    if (err) {
      console.log("Error al realizar la select", err);
      return res.status(500).json("Error al realizar la consulta");
    }
    if (recursos.length === 0) {
      return res.status(404).json("No se ha encontrado el recurso para eliminar.");
    }
    var ids = recursos.map(function (r) { return r.id; });

    // Por las claves foraneas, primero se borran las resenyas y reservas del recurso
    conexion.query("DELETE FROM resenyas WHERE recurso IN (?)", [ids], function (err) {
      if (err) {
        console.log("Error al realizar el delete", err);
        return res.status(500).json("Error al realizar el borrado");
      }
      conexion.query("DELETE FROM reservas WHERE recurso IN (?)", [ids], function (err) {
        if (err) {
          console.log("Error al realizar el delete", err);
          return res.status(500).json("Error al realizar el borrado");
        }
        conexion.query("DELETE FROM recursos WHERE id IN (?)", [ids], function (err) {
          if (err) {
            console.log("Error al realizar el delete", err);
            return res.status(500).json("Error al realizar el borrado");
          }
          res.status(200).json("Recurso eliminado correctamente.");
        });
      });
    });
  });
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Servidor en http://localhost:3000');
});
