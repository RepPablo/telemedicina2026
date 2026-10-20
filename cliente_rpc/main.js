var app = rpc("localhost", "gestion_pacientes");

var loginSanitario = app.procedure("loginSanitario");
var crearSanitario = app.procedure("crearSanitario");
var obtenerCategorias = app.procedure("obtenerCategorias");
var obtenerModelos = app.procedure("obtenerModelos");
var editarDatos = app.procedure("editarDatos");
var obtenerSanitario = app.procedure("obtenerSanitario");
var obtenerRecursos = app.procedure("obtenerRecursos");
var obtenerReservas = app.procedure("obtenerReservas");
var obtenerRecursosDisponibles = app.procedure("obtenerRecursosDisponibles");
var obtenerResenyas = app.procedure("obtenerResenyas");
var crearResenya = app.procedure("crearResenya");
var reservarRecurso = app.procedure("reservarRecurso");
var iniciarReserva = app.procedure("iniciarReserva");
var finalizarReserva = app.procedure("finalizarReserva");
var cancelarReserva = app.procedure("cancelarReserva");
var calcularTiempoReserva = app.procedure("calcularTiempoReserva");
var contarReservasPendientes = app.procedure("contarReservasPendientes");
var duplicarReserva = app.procedure("duplicarReserva");
var obtenerRecurso = app.procedure("obtenerRecurso");
var obtenerSanitariosPendientes = app.procedure("obtenerSanitariosPendientes");
var obtenerSanitariosNoFinalizados = app.procedure("obtenerSanitariosNoFinalizados");

var seccionActual = "acceso";
var idSanitarioActual = null;
var idRecursoActual = null;
var idReservaActual = null;
var modelosCargados = [];
var categoriasCargadas = [];
var conexionWS = null;
var nombreSanitarioActual = null;

function cambiarSeccion(seccion) {
    document.getElementById(seccionActual).style.display = "none";
    document.getElementById(seccion).style.display = "block";
    seccionActual = seccion;
}

function salir() {
    if (conexionWS) {
        conexionWS.close();
        conexionWS = null;
    }
    cambiarSeccion("acceso");
}

function cargar() {
    obtenerCategorias(function(cats) {
        categoriasCargadas = cats;
        // Rellena el select de categorias de "Nueva reserva" con las de la base de datos
        var select = document.getElementById("categoria_nueva");
        select.innerHTML = "";
        for (var i = 0; i < cats.length; i++) {
            var opcion = document.createElement("option");
            opcion.value = cats[i].id;
            opcion.text = cats[i].nombre;
            select.appendChild(opcion);
        }
    });
    obtenerModelos(function(modelos) {
        modelosCargados = modelos;
    });
}

function filtrarModelos() {
    var idCategoria = document.getElementById("categoria_nueva").value;
    var selectModelo = document.getElementById("modelo_nuevo");
    selectModelo.innerHTML = "";

    for (var i = 0; i < modelosCargados.length; i++) {
        var m = modelosCargados[i];
        if (idCategoria == 0 || m.categoria == idCategoria) {
            var opcion = document.createElement("option");
            opcion.value = m.id;
            opcion.text = m.nombre;
            selectModelo.appendChild(opcion);
        }
    }
    mostrarRecursosDisponibles();
}

function abrirNuevaReserva() {
    idRecursoActual = null;
    cambiarSeccion("nueva_reserva");
    document.getElementById("categoria_nueva").selectedIndex = 0;   // primera categoria de la lista
    document.getElementById("horas_estimadas_nueva").value = "";
    filtrarModelos();
}

function refrescarHome() {
    obtenerSanitario(idSanitarioActual, function(sanitario) {
        if (sanitario == null) {
            document.getElementById("bienvenida").innerHTML = "";
            return;
        }
        document.getElementById("bienvenida").innerHTML =
            "Bienvenido/a <strong>" + sanitario.nombre + " " + sanitario.apellidos + "</strong>.";
    });
    mostrarReservas();
}

function mostrarRecursosDisponibles() {
    var idModelo = document.getElementById("modelo_nuevo").value;
    var tbody = document.getElementById("tbody_recursos");
    tbody.innerHTML = "";

    obtenerRecursosDisponibles(idModelo, function(recursos) {
        for (var i = 0; i < recursos.length; i++) {
            var r = recursos[i];
            var boton = r.horas_restantes == "Disponible"
                ? "<button onclick='retirarRecurso(" + r.id + ")'>Retirar</button>"
                : "<button onclick='reservarNuevoRecurso(" + r.id + ")'>Reservar</button>";

            tbody.innerHTML += "<tr>" +
                "<td>" + r.numero_serie + "</td>" +
                "<td>" + r.ubicacion + "</td>" +
                "<td>" + r.horas_restantes + "</td>" +
                "<td>" + r.valoracion + "</td>" +
                "<td>" + boton + "</td>" +
                "</tr>";
        }
    });
}

function retirarRecurso(idRecurso) {
    var horasEstimadas = Number(document.getElementById("horas_estimadas_nueva").value);
    if (!horasEstimadas || horasEstimadas <= 0) {
        alert("Por favor, introduce las horas estimadas de uso.");
        return;
    }
    // Capturar afectados ANTES de modificar el estado de las reservas
    obtenerSanitariosNoFinalizados(idRecurso, idSanitarioActual, function(afectados) {
        reservarRecurso(idRecurso, idSanitarioActual, horasEstimadas, function(idNuevaReserva) {
            if (idNuevaReserva == null) {
                alert("No se ha podido completar la reserva.");
                return;
            }
            iniciarReserva(idNuevaReserva, function(ok) {
                if (ok) {
                    enviarAvisoReserva(idRecurso, "reservaIniciada", afectados);
                    alert("Recurso retirado correctamente.");
                    mostrarReservas();
                    cambiarSeccion("home");
                } else {
                    alert("No se ha podido iniciar la reserva.");
                }
            });
        });
    });
}

function reservarNuevoRecurso(idRecurso) {
    var horasEstimadas = Number(document.getElementById("horas_estimadas_nueva").value);
    if (!horasEstimadas || horasEstimadas <= 0) {
        alert("Por favor, introduce las horas estimadas de uso.");
        return;
    }
    reservarRecurso(idRecurso, idSanitarioActual, horasEstimadas, function(idNuevaReserva) {
        if (idNuevaReserva != null) {
            alert("Reserva creada correctamente.");
            mostrarReservas();
            cambiarSeccion("home");
        } else {
            alert("No se ha podido crear la reserva.");
        }
    });
}

function login() {
    var usuario = document.getElementById("acceso_usuario").value;
    var contraseña = document.getElementById("acceso_contraseña").value;

    loginSanitario(usuario, contraseña, function(id) {
        if (id == null) {
            alert("Error al iniciar sesión.");
        } else {
            idSanitarioActual = id;
            cambiarSeccion("home");
            seccionActual = 'home';

            obtenerSanitario(idSanitarioActual, function(sanitario) {
                if (sanitario == null) return;
                nombreSanitarioActual = sanitario.nombre + " " + sanitario.apellidos;
                document.getElementById("bienvenida").innerHTML =
                    "Bienvenido/a <strong>" + nombreSanitarioActual + "</strong>.";

                conexionWS = new WebSocket("ws://localhost:4445", "avisos");
                conexionWS.addEventListener("open", function() {
                    conexionWS.send(JSON.stringify({
                        operacion: "identificar",
                        rol: "sanitario",
                        id: idSanitarioActual,
                        nombre: nombreSanitarioActual
                    }));
                });

                conexionWS.addEventListener("message", function(msg) {
                    var aviso = JSON.parse(msg.data);
                    var tbody = document.getElementById("tbody_avisos");
                    var fila = "<tr>"
                        + "<td style='background-color:" + aviso.color + ";'>" + new Date(aviso.fecha).toLocaleString() + "</td>"
                        + "<td style='background-color:" + aviso.color + ";'>" + aviso.origen + "</td>"
                        + "<td style='background-color:" + aviso.color + ";'>" + aviso.texto + "</td>"
                        + "</tr>";
                    tbody.innerHTML += fila;
                    // Refrescar tabla de reservas cuando se libera un recurso que podemos retirar
                    if (aviso.tipo === "reserva") {
                        mostrarReservas();
                    }
                });
            });

            mostrarReservas();
        }
    });
}

function resolverNombresRecurso(recurso) {
    var nombreModelo = "" + recurso.modelo;
    var nombreCategoria = "" + recurso.categoria;
    for (var i = 0; i < modelosCargados.length; i++) {
        if (modelosCargados[i].id == recurso.modelo) {
            nombreModelo = modelosCargados[i].nombre;
            for (var j = 0; j < categoriasCargadas.length; j++) {
                if (categoriasCargadas[j].id == modelosCargados[i].categoria) {
                    nombreCategoria = categoriasCargadas[j].nombre;
                    break;
                }
            }
            break;
        }
    }
    return { nombreModelo: nombreModelo, nombreCategoria: nombreCategoria };
}

function enviarAvisoReserva(idRecurso, operacion, sanitariosAfectados) {
    if (!conexionWS) return;
    obtenerRecurso(idRecurso, function(recurso) {
        if (!recurso) return;
        var nombres = resolverNombresRecurso(recurso);
        conexionWS.send(JSON.stringify({
            operacion: operacion,
            nombreCategoria: nombres.nombreCategoria,
            nombreModelo: nombres.nombreModelo,
            numeroSerie: recurso.numero_serie,
            sanitariosAfectados: sanitariosAfectados
        }));
    });
}

function registro() {
    var nombre = document.getElementById("registro_nombre").value;
    var apellidos = document.getElementById("registro_apellidos").value;
    var usuario = document.getElementById("registro_usuario").value;
    var contraseña = document.getElementById("registro_contraseña").value;

    crearSanitario(nombre, apellidos, usuario, contraseña, function(id) {
        if (id != null) {
            alert("Sanitario registrado correctamente.");
            cambiarSeccion("acceso");
        } else {
            alert("No se ha podido completar el registro. El usuario ya existe.");
        }
    });
}

function actualizarSanitario() {
    var datosSanitario = {
        nombre: document.getElementById("editar_nombre").value,
        apellidos: document.getElementById("editar_apellidos").value,
        usuario: document.getElementById("editar_usuario").value,
        contraseña: document.getElementById("editar_contraseña").value
    };

    editarDatos(idSanitarioActual, datosSanitario, function(ok) {
        if (ok) {
            alert("Datos actualizados correctamente.");
            refrescarHome();
            cambiarSeccion("home");
        } else {
            alert("No se han podido actualizar los datos. El usuario ya existe.");
            cambiarSeccion("home");
        }
    });
}

function abrirEditar() {
    obtenerSanitario(idSanitarioActual, function(sanitario) {
        if (sanitario == null) return;
        document.getElementById("editar_nombre").value = sanitario.nombre;
        document.getElementById("editar_apellidos").value = sanitario.apellidos;
        document.getElementById("editar_usuario").value = sanitario.usuario;
        document.getElementById("editar_contraseña").value = "";
        cambiarSeccion("actualizar");
    });
}

function mostrarReservas() {
    obtenerReservas(idSanitarioActual, function(reservas) {
        var tbodyPend = document.getElementById("tbody_pendientes");
        var tbodyReal = document.getElementById("tbody_realizadas");
        tbodyPend.innerHTML = "";
        tbodyReal.innerHTML = "";

        for (var i = 0; i < reservas.length; i++) {
            var r = reservas[i];

            if (r.fecha_inicio == null) {
                // Reserva pendiente: esperando a que el recurso quede libre
                var botonRetirar = r.horas_restantes <= 0
                    ? "<button onclick='iniciarReservaCliente(" + r.id + "," + r.recurso + ")'>Retirar</button>"
                    : "";

                var fila = "<tr>" +
                    "<td>" + r.categoria + "</td>" +
                    "<td>" + r.modelo + "</td>" +
                    "<td>" + r.numero_serie + "</td>" +
                    "<td>" + r.ubicacion + "</td>" +
                    "<td>" + formatearFecha(r.fecha_peticion) + "</td>" +
                    "<td>" + r.horas_restantes + "</td>" +
                    "<td>" + botonRetirar + "</td>" +
                    "<td><button onclick='cancelarReservaCliente(" + r.id + ")'>X</button></td>" +
                    "</tr>";
                tbodyPend.innerHTML += fila;
            } else {
                // Reserva iniciada: activa (sin fecha_fin) o completada (con fecha_fin)
                var botonesAccion;
                if (r.fecha_fin == null) {
                    botonesAccion =
                        "<button onclick='devolverRecurso(" + r.id + "," + r.recurso + ")'>Devolver</button> " +
                        "<button onclick='abrirResenya(" + r.recurso + ",\"" + r.numero_serie + "\")'>Reseña</button>";
                } else {
                    botonesAccion =
                        "<button onclick='abrirResenya(" + r.recurso + ",\"" + r.numero_serie + "\")'>Reseña</button>";
                }

                var fila = "<tr>" +
                    "<td>" + r.categoria + "</td>" +
                    "<td>" + r.modelo + "</td>" +
                    "<td>" + r.numero_serie + "</td>" +
                    "<td>" + r.horas_estimadas + "</td>" +
                    "<td>" + formatearFecha(r.fecha_inicio) + "</td>" +
                    "<td>" + formatearFecha(r.fecha_fin) + "</td>" +
                    "<td>" + botonesAccion + "</td>" +
                    "</tr>";
                tbodyReal.innerHTML += fila;
            }
        }
    });
}

function iniciarReservaCliente(idReserva, idRecurso) {
    // Capturar afectados ANTES de que iniciarReserva cierre automáticamente reservas expiradas
    obtenerSanitariosNoFinalizados(idRecurso, idSanitarioActual, function(afectados) {
        iniciarReserva(idReserva, function(ok) {
            if (ok) {
                enviarAvisoReserva(idRecurso, "reservaIniciada", afectados);
                alert("Recurso retirado correctamente.");
                mostrarReservas();
            } else {
                alert("No se ha podido retirar el recurso. Es posible que siga en uso.");
            }
        });
    });
}

function devolverRecurso(idReserva, idRecurso) {
    // Capturar afectados antes de finalizar (los pendientes que esperan el recurso)
    obtenerSanitariosNoFinalizados(idRecurso, idSanitarioActual, function(afectados) {
        finalizarReserva(idReserva, function(ok) {
            if (ok) {
                enviarAvisoReserva(idRecurso, "reservaFinalizada", afectados);
                alert("Recurso devuelto correctamente.");
                mostrarReservas();
            } else {
                alert("No se ha podido devolver el recurso.");
            }
        });
    });
}

function cancelarReservaCliente(idReserva) {
    cancelarReserva(idReserva, function(ok) {
        if (ok) {
            mostrarReservas();
        } else {
            alert("No se ha podido cancelar la reserva.");
        }
    });
}

function abrirResenya(idRecurso, numeroSerie) {
    idRecursoActual = idRecurso;
    document.getElementById("recurso_resenya").textContent = numeroSerie;
    cambiarSeccion("mensaje_nuevo");
}

function nuevaResenya() {
    var valoracion = document.getElementById("valoracion_resenya_nueva").value;
    var descripcion = document.getElementById("texto_resenya_nueva").value;

    if (!descripcion.trim()) {
        alert("Por favor, escribe un texto para la reseña.");
        return;
    }

    crearResenya(idRecursoActual, idSanitarioActual, valoracion, descripcion, function(idResenya) {
        if (idResenya != null) {
            if (conexionWS) {
                obtenerRecurso(idRecursoActual, function(recurso) {
                    if (recurso) {
                        var nombres = resolverNombresRecurso(recurso);
                        conexionWS.send(JSON.stringify({
                            operacion: "resenyaCreada",
                            nombreCategoria: nombres.nombreCategoria,
                            nombreModelo: nombres.nombreModelo,
                            numeroSerie: recurso.numero_serie,
                            valoracion: valoracion
                        }));
                    }
                });
            }
            alert("Reseña añadida correctamente.");
            document.getElementById("texto_resenya_nueva").value = "";
            cambiarSeccion("home");
        } else {
            alert("No se ha podido añadir la reseña.");
        }
    });
}

function formatearFecha(fecha) {
    if (!fecha) return "-";
    var d = new Date(fecha);
    return d.toLocaleDateString() + "<br>" + d.toLocaleTimeString();
}

function tiempo(idReserva) {
    calcularTiempoReserva(idReserva, function(tiempoEnHoras) {
        if(tiempoEnHoras == null) {
            alert("La reserva no está finalizada.");
        } else {
            alert("El recurso se usó " + tiempoEnHoras + " horas.");
        }
    });
}

function contarReservas() {
    contarReservasPendientes(function(total) {
        if(total == 0) {
            alert("No hay reservas pendientes...");
        } else {
            alert("Hay " + total + " reservas pendientes.");
        }
    });
}

function duplicar(idReserva) {
    duplicarReserva(idReserva, function(ok) {
        if(ok) {
            alert("Reserva duplicada correctamente.");
            mostrarReservas();
            cambiarSeccion('home');
        } else {
            alert("No se ha podido duplicar la reserva.");
        }
    });
}