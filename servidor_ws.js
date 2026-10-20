var http = require("http");
var httpServer = http.createServer();
var WebSocketServer = require("websocket").server;

var wsServer = new WebSocketServer({ httpServer: httpServer });

var puerto = 4445;
httpServer.listen(puerto, function() {
    console.log("Servidor WebSocket iniciado en puerto: ", puerto);
});

var clientes = [];
wsServer.on("request", function(request) {
    var connection = request.accept("avisos", request.origin);

    var cliente = {
        connection: connection,
        rol: null,
        id: null,
        nombre: null
    };
    clientes.push(cliente);

    connection.on("message", function(message) {
        if(message.type == "utf8") {
            var msg = JSON.parse(message.utf8Data);

            switch(msg.operacion) {
                
                case "identificar":
                    cliente.rol = msg.rol;
                    cliente.id = msg.id;
                    cliente.nombre = msg.nombre;
                    break;

                case "reservaIniciada":
                case "reservaFinalizada":
                    // Avisar a sanitarios con reserva no finalizada del mismo recurso
                    var texto = "SE HA " + (msg.operacion == "reservaIniciada" ? "INICIADO" : "FINALIZADO") +
                        " LA RESERVA DEL " + msg.nombreCategoria +
                        " MODELO " + msg.nombreModelo +
                        " CON CÓDIGO " + msg.numeroSerie;

                    for(var i = 0; i < clientes.length; i++) {
                        if(clientes[i].rol == "sanitario" && msg.sanitariosAfectados.indexOf(clientes[i].id) != -1) {
                            clientes[i].connection.sendUTF(JSON.stringify({
                                tipo: "reserva",
                                color: "#fecaca",
                                origen: cliente.nombre,
                                texto: texto,
                                fecha: new Date()
                            }));
                        }
                    }
                    break;

                case "recursoCreado":
                    // Avisa a todos los sanitarios conectados
                    var texto = "SE HA CREADO UN NUEVO RECURSO " + msg.nombreCategoria +
                        " MODELO " + msg.nombreModelo +
                        " CON CÓDIGO " + msg.numeroSerie;

                    for(var i = 0; i < clientes.length; i++) {
                        if(clientes[i].rol == "sanitario") {
                            clientes[i].connection.sendUTF(JSON.stringify({
                                tipo: "recurso",
                                color: "#bfdbfe",
                                origen: cliente.nombre,
                                texto: texto,
                                fecha: new Date()
                            }));
                        }
                    }
                    break;

                case "resenyaCreada":
                    // Avisar a todos los gestores conectados
                    var texto = "SE HA CREADO UNA RESEÑA PARA EL " + msg.nombreCategoria +
                        " MODELO " + msg.nombreModelo +
                        " CON CÓDIGO " + msg.numeroSerie +
                        " Y PUNTUACIÓN " + msg.valoracion;

                    for(var i = 0; i < clientes.length; i++) {
                        if(clientes[i].rol == "gestor") {
                            clientes[i].connection.sendUTF(JSON.stringify({
                                tipo: "resenya",
                                color: "#d9f99d",
                                origen: cliente.nombre,
                                texto: texto,
                                fecha: new Date()
                            }));
                        }
                    }
                    break;
            }
        }
    });

    connection.on("close", function() {
        for(var i = 0; i < clientes.length; i++) {
            if(clientes[i] === cliente) {
                clientes.splice(i, 1);
                break;
            }
        }
    });
});