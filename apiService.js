// apiService.js
import axios from 'axios';
import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

const apiService = {
  // 🔹 Obtener y enriquecer datos de un servidor 815
  fetchAndEnrich815Data: async (server) => {
    try {
      const basicAuthToken = Buffer.from(`${server.username}:${server.password}`).toString('base64');

      const [
        responseClientes,
        responseCiudades,
        responseEquipos,
        responseIPs,
        responseNodos
      ] = await Promise.all([
        axios.get(`${server.url}/gateway/integracion/clientes/cuentasimple/listar?&json`, {
          httpsAgent: agent,
          headers: { 'Authorization': `Basic ${basicAuthToken}` },
        }),
        axios.get(`${server.url}/gateway/integracion/geografico/ciudad/listar?&json`, {
          httpsAgent: agent,
          headers: { 'Authorization': `Basic ${basicAuthToken}` },
        }),
        axios.get(`${server.url}/gateway/integracion/hardware/equipocliente/listar?json`, {
          httpsAgent: agent,
          headers: { 'Authorization': `Basic ${basicAuthToken}` },
        }),
        axios.get(`${server.url}/gateway/integracion/red/direccionip/listar?&json`, {
          httpsAgent: agent,
          headers: { 'Authorization': `Basic ${basicAuthToken}` },
        }),
        axios.get(`${server.url}/gateway/integracion/hardware/nodored/listar?activo=True&admite_clientes=True&json`, {
          httpsAgent: agent,
          headers: { 'Authorization': `Basic ${basicAuthToken}` },
        }),
      ]);

      // Mapas para referencias
      const mapaCiudades = {};
      responseCiudades.data.forEach(item => mapaCiudades[item.pk] = item.fields.nombre);

      const mapaEquipos = {};
      responseEquipos.data.forEach(item => mapaEquipos[item.pk] = item.fields);

      const mapaIPs = {};
      responseIPs.data.forEach(item => mapaIPs[item.pk] = item.fields);

      const mapaNodos = {};
      responseNodos.data.forEach(item => mapaNodos[item.pk] = item.fields);

      // Enriquecer clientes
      return responseClientes.data.map(item => {
        const cliente = {
          ...item.fields,
          pk: item.pk,
          model: item.model,
          conector: item.fields.conector, // 👈 necesario para unir con Wisphub
        };

        cliente.ciudad_815 = mapaCiudades[cliente.ciudad] || 'Desconocida';
        cliente.equipo_cliente = mapaEquipos[cliente.equipo_cliente]?.nombre || 'Desconocido';
        cliente.direccion_ip_815 = mapaIPs[cliente.direccion_ip] || 'Desconocida';
        cliente.nodo_de_red_815 = mapaNodos[cliente.nodo_de_red]?.nombre || 'Desconocida';

        return cliente;
      });
    } catch (error) {
      console.error(`❌ Error al obtener/enriquecer datos desde ${server.name}`, error.message);
      return [];
    }
  },

  // 🔹 Obtener clientes de WispHub
  fetchWispHubClients: async () => {
    try {
      const apiKey = process.env.WISPHUB_API_KEY;
      const apiUrl = process.env.API_URL;

      let allClients = [];
      let offset = 0;
      const limit = 300;

      while (true) {
        const response = await axios.get(`${apiUrl}/api/clientes/?limit=${limit}&offset=${offset}`, {
          headers: {
            'Authorization': `Api-Key ${apiKey}`,
            'Accept': 'application/json'
          }
        });

        const { results, next } = response.data;
        if (!results || results.length === 0) break;

        allClients = allClients.concat(results);

        if (!next) break;
        offset += limit;
      }

      return allClients;
    } catch (error) {
      console.error('❌ Error al obtener clientes de WispHub', error.message);
      return [];
    }
  },
   // 🔹 Unir datos de clientes por zona específica
  fetchAndCombineClientsByZone: async (zoneName, ZONE_MAPPING) => {
    try {
      console.log(`--- Iniciando unión de clientes para la zona: ${zoneName} ---`);

      // 1️⃣ Buscar servidor 815 correspondiente
      const correct815Entry = ZONE_MAPPING[zoneName];
      if (!correct815Entry) {
        return { message: `No se encontró un servidor 815 para la zona: ${zoneName}` };
      }

      // 2️⃣ Obtener clientes de ese servidor 815
      const enrichedData = await apiService.fetchAndEnrich815Data(correct815Entry);
      console.log(`✅ Datos obtenidos de 815 (${zoneName}): ${enrichedData.length}`);

      // 3️⃣ Obtener clientes de WispHub
      const allWispHubClients = await apiService.fetchWispHubClients();
      console.log(`✅ Datos totales obtenidos de WispHub: ${allWispHubClients.length}`);

      // 4️⃣ Crear mapa de WispHub por id_servicio
      const mapaWispHub = {};
      allWispHubClients.forEach(cliente => {
        if (cliente.id_servicio) {
          mapaWispHub[cliente.id_servicio] = cliente;
        }
      });

      // 5️⃣ Unir clientes de 815 con WispHub
      const clientesUnidos = [];
      enrichedData.forEach(cliente815 => {
        const clienteWispHub = mapaWispHub[cliente815.conector];
        if (clienteWispHub) {
          clientesUnidos.push({
            ...cliente815,
            ...clienteWispHub
          });
        }
      });

      console.log(`--- Unión finalizada (${zoneName}). Total clientes unidos: ${clientesUnidos.length}`);
      return clientesUnidos;

    } catch (error) {
      console.error(`❌ Error al unir clientes de la zona ${zoneName}:`, error.message);
      return [];
    }
  },

  // 🔹 Unir datos de todos los servidores 815 con WispHub
  fetchAndCombineAllClients: async (SERVERS_815) => {
    console.log('--- Iniciando unión de datos entre 815 y WispHub ---');

    let all815Data = [];
    for (const server of SERVERS_815) {
      const enrichedData = await apiService.fetchAndEnrich815Data(server);
      all815Data = all815Data.concat(enrichedData);
    }
    console.log(`✅ Datos totales obtenidos de 815: ${all815Data.length}`);

    const allWispHubClients = await apiService.fetchWispHubClients();
    console.log(`✅ Datos totales obtenidos de WispHub: ${allWispHubClients.length}`);

    const mapaWispHub = {};
    allWispHubClients.forEach(cliente => {
      if (cliente.id_servicio) {
        mapaWispHub[cliente.id_servicio] = cliente;
      }
    });
    console.log(`--- Mapa de WispHub creado. Cantidad de entradas: ${Object.keys(mapaWispHub).length}`);

    const clientesUnidos = [];
    all815Data.forEach(cliente815 => {
      const clienteWispHub = mapaWispHub[cliente815.conector];
      if (clienteWispHub) {
        clientesUnidos.push({
          ...cliente815,
          ...clienteWispHub
        });
      }
    });

    console.log('--- Unión finalizada. Total clientes unidos:', clientesUnidos.length);
    return clientesUnidos;
  },

  // 🔹 Buscar cliente por cédula
fetchClientByCedula: async (cedula, ZONE_MAPPING) => {
  try {
    const apiKey = process.env.WISPHUB_API_KEY;
    const apiUrl = process.env.API_URL;

    console.log(`--- Buscando cliente con cédula ${cedula} en WispHub ---`);
    
    // 1️⃣ Buscar cliente en WispHub
    const responseWispHub = await axios.get(`${apiUrl}/api/clientes/?cedula=${cedula}`, {
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    const clientesWispHub = responseWispHub.data.results;
    if (!clientesWispHub || clientesWispHub.length === 0) {
      return { message: `Cliente con cédula ${cedula} no encontrado en WispHub.` };
    }

    // 2️⃣ Procesar todos los clientes encontrados
  const clientesProcesados = await Promise.all(
  clientesWispHub.map(async (cliente) => {
    const idServicio = cliente.id_servicio;
    if (!idServicio) {
      return { ...cliente, warning: 'Sin id_servicio en WispHub' };
    }

    const zoneName = cliente.zona.nombre;
    const correct815Entry = ZONE_MAPPING[zoneName];
    if (!correct815Entry) {
      return { ...cliente, warning: `Zona ${zoneName} no encontrada en mapping` };
    }

    const basicAuthToken = Buffer.from(
      `${correct815Entry.username}:${correct815Entry.password}`
    ).toString('base64');
    const direct815SearchUrl = `${correct815Entry.url}/gateway/integracion/clientes/cuentasimple/listar?&json&conector=${idServicio}`;

    let clientes815 = [];
    try {
      const response815 = await axios.get(direct815SearchUrl, {
        httpsAgent: agent,
        headers: { Authorization: `Basic ${basicAuthToken}` },
      });
      clientes815 = response815.data || [];
    } catch (error) {
      console.error(`❌ Error consultando 815 para id_servicio=${idServicio}:`, error.message);
    }

    if (clientes815.length === 0) {
      return { ...cliente, warning: `Cliente con id_servicio ${idServicio} no encontrado en 815` };
    }

    // 🔹 Procesar cada contrato del cliente
    return Promise.all(
  clientes815.map(async (foundClient815) => {
    // 🔹 Enriquecer cliente con datos de 815
    const enrichedClient = await apiService.enrich815Client(
      foundClient815,
      correct815Entry.url,
      basicAuthToken
    );

    // 🔹 JSON del cliente
    const clienteJSON = {
      ...cliente,
      ...enrichedClient,
    };

    // 🔹 JSON del diagnóstico
    let diagnosticoJSON = {};
    try {
      const pkConexion = foundClient815.pk;
      const diagnosticoResponse = await axios.get(
        `${correct815Entry.url}/gateway/integracion/hardware/nodored/diagnosticar_multiapi/?pk_conexion=${pkConexion}&json`,
        {
          httpsAgent: agent,
          headers: { Authorization: `Basic ${basicAuthToken}` },
        }
      );
      diagnosticoJSON = diagnosticoResponse.data;
    } catch (error) {
      console.error('❌ Error al consultar diagnóstico:', error.message);
      diagnosticoJSON = { error: 'No se pudo obtener diagnóstico' };
    }

    // 🔹 Retornar 2 JSON separados
    return {
      cliente: clienteJSON,
      diagnostico: diagnosticoJSON,
    };
  })
);
  })
);

// 🔹 Flatten en caso de que haya arrays anidados
const clientesFinal = clientesProcesados.flat();

// 🔹 Retornar
return clientesFinal.length === 1 ? clientesFinal[0] : clientesFinal;
  } catch (error) {
    console.error('❌ Error al procesar la búsqueda por cédula.', error.message);
    if (error.response) {
      console.error('Detalles del error HTTP:', error.response.status, error.response.data);
    }
    throw error;
  }
},

  

  // 🔹 Listar nodos de red disponibles
listAvailableNodes: async (zoneName, ZONE_MAPPING) => {
  try {
    const correct815Entry = ZONE_MAPPING[zoneName];
    if (!correct815Entry) return { message: `No se encontró servidor para zona ${zoneName}` };

    const basicAuthToken = Buffer.from(`${correct815Entry.username}:${correct815Entry.password}`).toString('base64');

    const response = await axios.get(
      `${correct815Entry.url}/gateway/integracion/hardware/nodored/listar?activo=True&admite_clientes=True&json`,
      {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` }
      }
    );

    return response.data; // devuelve lista de nodos
  } catch (error) {
    console.error("❌ Error al listar nodos:", error.message);
    return [];
  }
},

// 🔹 Verificar ONU e IP disponibles en un nodo
getAvailableServicesFromNode: async (zoneName, nodoPk = 1400, ZONE_MAPPING) => {
  try {
    const correct815Entry = ZONE_MAPPING[zoneName];
    if (!correct815Entry) 
      return { message: `No se encontró servidor para zona ${zoneName}` };

    const basicAuthToken = Buffer.from(`${correct815Entry.username}:${correct815Entry.password}`).toString('base64');

    const response = await axios.get(
      `${correct815Entry.url}/gateway/integracion/hardware/nodored/listar_servicios?&pk=${nodoPk}&json`,
      {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` }
      }
    );

    const data = response.data.data;

    const dhcpServicio = data?.dhcp?.servicio || null;

    const onuDisponible = dhcpServicio && dhcpServicio.nombre.includes("ONU") ? dhcpServicio : null;
    const ipDisponible = dhcpServicio && dhcpServicio.ip?.ip_disponible === "1" ? dhcpServicio.ip : null;

    return {
      onu: onuDisponible,
      ip: ipDisponible
    };
  } catch (error) {
    console.error("❌ Error al listar servicios de nodo:", error.message);
    return {};
  }
},

listPlans: async (zoneName, ZONE_MAPPING) => {
    try {
      const correct815Entry = ZONE_MAPPING[zoneName];
      if (!correct815Entry)
        return [];

      const basicAuthToken = Buffer.from(
        `${correct815Entry.username}:${correct815Entry.password}`
      ).toString("base64");

      const url = `${correct815Entry.url}/gateway/integracion/entrega/plan/listar?json`;

      const response = await axios.get(url, {
        httpsAgent: agent,
        headers: { Authorization: `Basic ${basicAuthToken}` },
      });

      // Siempre devolver array plano
      return Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];
    } catch (error) {
      console.error("❌ Error en listPlans:", error.message);
      return [];
    }
  },

  // 📌 Listar equipos cliente
  listEquipos: async (zoneName, ZONE_MAPPING) => {
    try {
      const correct815Entry = ZONE_MAPPING[zoneName];
      if (!correct815Entry)
        return [];

      const basicAuthToken = Buffer.from(
        `${correct815Entry.username}:${correct815Entry.password}`
      ).toString("base64");

      const url = `${correct815Entry.url}/gateway/integracion/hardware/equipocliente/listar?json`;

      const response = await axios.get(url, {
        httpsAgent: agent,
        headers: { Authorization: `Basic ${basicAuthToken}` },
      });

      return Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];
    } catch (error) {
      console.error("❌ Error en listEquipos:", error.message);
      return [];
    }
  },

  // 📌 Listar accesos DHCP (nodo fijo 1400)
  listAccesosDhcp: async (zoneName, ZONE_MAPPING) => {
    try {
      const correct815Entry = ZONE_MAPPING[zoneName];
      if (!correct815Entry)
        return [];

      const basicAuthToken = Buffer.from(
        `${correct815Entry.username}:${correct815Entry.password}`
      ).toString("base64");

      const nodoPk = 1400;
      const url = `${correct815Entry.url}/gateway/integracion/hardware/nodored/listar_servicios?pk=${nodoPk}&json`;

      const response = await axios.get(url, {
        httpsAgent: agent,
        headers: { Authorization: `Basic ${basicAuthToken}` },
      });

      const dhcpServicio = response.data?.data?.dhcp?.servicio;
      if (!dhcpServicio) return [];

      return [
        {
          pk: dhcpServicio.pk,
          nombre: dhcpServicio.nombre,
          ip: dhcpServicio.ip?.direccion_ip,
          pkIp: dhcpServicio.ip?.pk_ip_disponible,
        },
      ];
    } catch (error) {
      console.error("❌ Error en listAccesosDhcp:", error.message);
      return [];
    }
  },


// 🔹 Crear cliente en 815 (requiere IP asignada) y luego crear conexión
createClientIn815: async (zoneName, formData, pkIpDisponible, ZONE_MAPPING) => {
  try {
    const correct815Entry = ZONE_MAPPING[zoneName];
    if (!correct815Entry) 
      return { message: `No se encontró servidor para zona ${zoneName}` };

    const basicAuthToken = Buffer.from(
      `${correct815Entry.username}:${correct815Entry.password}`
    ).toString("base64");

    const ciudad = correct815Entry.ciudad;  
    const {
      nombre,
      email,
      telefono,
      domicilio,
      cedula,
      plan,
      mac,
      modoConexion,
      accesoDhcp,
      equipoCliente,
      conector,
      numeroDeSerie,
      lat,
      lng,  
    } = formData;

    // 🔹 Crear cliente
    const createClientUrl =
      `${correct815Entry.url}/gateway/integracion/clientes/cliente/crear/` +
      `?nombre=${encodeURIComponent(nombre)}` +
      `&email=${encodeURIComponent(email)}` +
      `&telefono=${encodeURIComponent(telefono)}` +
      `&ciudad=${ciudad}` +
      `&domicilio=${encodeURIComponent(domicilio)}` +
      `&extra_1=${cedula}` +
      `&direccion_ip=${pkIpDisponible}` +
      `&json`;

    const clientResponse = await axios.get(createClientUrl, {
      httpsAgent: agent,
      headers: { Authorization: `Basic ${basicAuthToken}` },
    });

    const clientData = Array.isArray(clientResponse.data)
      ? clientResponse.data[0]
      : clientResponse.data;

    if (!clientData?.pk) {
      return { message: "Cliente creado pero no se obtuvo pk", data: clientResponse.data };
    }

    const clientePk = clientData.pk;
    const nodoDeRed = 1400; // fijo
    const nombreConexion = `${conector} ${nombre}`;

    // 🔹 Crear conexión
    const createConexionUrl =
      `${correct815Entry.url}/gateway/integracion/clientes/cuentasimple/crear/` +
      `?nombre=${encodeURIComponent(nombreConexion)}` +
      `&ciudad=${ciudad}` +
      `&cliente=${clientePk}` +
      `&domicilio=${encodeURIComponent(domicilio)}` +
      `&plan=${plan}` +
      `&fecha_de_alta=${new Date().toISOString().split("T")[0]}` +
      `&direccion_mac=${mac}` +
      `&modo_de_conexion=${modoConexion}` +
      `&acceso_dhcp=${accesoDhcp}` +
      `&direccion_ip=${pkIpDisponible}` +
      `&numero_de_serie=${numeroDeSerie}` +
      `&equipo_cliente=${equipoCliente}` +
      `&nodo_de_red=${nodoDeRed}` +
      `&conector=${conector}` +
      `&extra_1=${cedula}` +
      `&lat=${lat || ""}` +
      `&lng=${lng || ""}` +
      `&json`;

      console.log("👉 URL de creación de conexión:", createConexionUrl);
      

    const conexionResponse = await axios.get(createConexionUrl, {
      httpsAgent: agent,
      headers: { Authorization: `Basic ${basicAuthToken}` },
    });

    return {
      cliente: clientData,
      conexion: conexionResponse.data,
    };
  } catch (error) {
    console.error("❌ Error al crear cliente o conexión:", error.message);
    return { message: "Error al crear cliente o conexión", error: error.message };
  }
},


aprovisionarClientePorSerial: async (zoneName, pkConexion, serialForm, ZONE_MAPPING, conectorPerfil) => {
  const correct815Entry = ZONE_MAPPING[zoneName];
  if (!correct815Entry) 
    return { message: `No se encontró servidor para zona ${zoneName}` };

  const basicAuthToken = Buffer.from(`${correct815Entry.username}:${correct815Entry.password}`).toString('base64');

  try {
    const serialParaAprovisionar = serialForm.toUpperCase();
    console.log("Serial recibido del form:", serialParaAprovisionar);
    console.log("Conector perfil recibido:", conectorPerfil, typeof conectorPerfil);

    if (!conectorPerfil) {
      return { message: "Debe seleccionar un conector/perfil para aprovisionar." };
    }

    const conectorPerfilFinal = typeof conectorPerfil === "number" ? conectorPerfil : Number(conectorPerfil);
    const urlAprovisionar = `${correct815Entry.url}/gateway/integracion/hardware/nodored/aprovisionar_multiapi/?pk_conexion=${pkConexion}&nro_serie=${serialParaAprovisionar}&conector_perfil=${conectorPerfilFinal}&json`;
    console.log("URL Aprovisionar:", urlAprovisionar);

    const responseAprovisionar = await axios.get(urlAprovisionar, {
      httpsAgent: agent,
      headers: { Authorization: `Basic ${basicAuthToken}` },
    });

    return {
      estado: "OK",
      mensaje: "Aprovisionamiento ejecutado",
      serialUsado: serialParaAprovisionar,
      perfilUsado: conectorPerfil,
      resultado: responseAprovisionar.data
    };
  } catch (error) {
    console.error(`❌ Error al aprovisionar conexión ${pkConexion}:`, error.message);
    if (error.response) {
      console.error('Detalles HTTP:', error.response.status, error.response.data);
    }
    return { message: 'Error al aprovisionar conexión', error: error.message };
  }
},

// 🔹 Listar ONUs disponibles en un nodo de una zona
listAvailableOnus: async (zoneName, nodoPk = 1400, ZONE_MAPPING) => {
  try {
    const correct815Entry = ZONE_MAPPING[zoneName];
    if (!correct815Entry) 
      return { message: `No se encontró servidor para zona ${zoneName}` };

    const basicAuthToken = Buffer.from(
      `${correct815Entry.username}:${correct815Entry.password}`
    ).toString('base64');

    const url = `${correct815Entry.url}/gateway/integracion/hardware/nodored/onus_sin_aprovisionar?&nodo=${nodoPk}&json`;

    const response = await axios.get(url, {
      httpsAgent: agent,
      headers: { 'Authorization': `Basic ${basicAuthToken}` }
    });

    console.log("Respuesta cruda ONUs:", response.data);

    const onus = response.data?.onus || [];

    return onus; // devuelve array de números de serie disponibles
  } catch (error) {
    console.error(`❌ Error al listar ONUs disponibles para zona ${zoneName}:`, error.message);
    return [];
  }
},



enrich815Client: async (cliente815, serverUrl, basicAuthToken) => {
  try {
    // Obtener ciudades, equipos, IPs y nodos
    const [responseCiudades, responseEquipos, responseIPs, responseNodos] = await Promise.all([
      axios.get(`${serverUrl}/gateway/integracion/geografico/ciudad/listar?&json`, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      }),
      axios.get(`${serverUrl}/gateway/integracion/hardware/equipocliente/listar?json`, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      }),
      axios.get(`${serverUrl}/gateway/integracion/red/direccionip/listar?&json`, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      }),
      axios.get(`${serverUrl}/gateway/integracion/hardware/nodored/listar?activo=True&admite_clientes=True&json`, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      }),
    ]);

    // Crear mapas
    const mapaCiudades = {};
    responseCiudades.data.forEach(item => mapaCiudades[item.pk] = item.fields.nombre);

    const mapaEquipos = {};
    responseEquipos.data.forEach(item => mapaEquipos[item.pk] = item.fields);

    const mapaIPs = {};
    responseIPs.data.forEach(item => mapaIPs[item.pk] = item.fields);

    const mapaNodos = {};
    responseNodos.data.forEach(item => mapaNodos[item.pk] = item.fields);

    // Enriquecer cliente
    const clienteEnriquecido = {
      ...cliente815.fields,
      pk: cliente815.pk,
      model: cliente815.model,
      conector: cliente815.fields.conector,
      ciudad_815: mapaCiudades[cliente815.fields.ciudad] || 'Desconocida',
      equipo_cliente: mapaEquipos[cliente815.fields.equipo_cliente]?.nombre || 'Desconocido',
      direccion_ip_815: mapaIPs[cliente815.fields.direccion_ip] || 'Desconocida',
      nodo_de_red_815: mapaNodos[cliente815.fields.nodo_de_red]?.nombre || 'Desconocida'
    };

    return clienteEnriquecido;
  } catch (error) {
    console.error('❌ Error al enriquecer cliente 815:', error.message);
    return cliente815; // Devuelve al menos el cliente original si falla
  }
},

getConectoresPerfil: async (zoneName, ZONE_MAPPING) => {
  try {
    const correct815Entry = ZONE_MAPPING[zoneName];
    if (!correct815Entry)
      return { message: `No se encontró servidor para zona ${zoneName}` };

    const basicAuthToken = Buffer.from(
      `${correct815Entry.username}:${correct815Entry.password}`
    ).toString("base64");

    const url = `${correct815Entry.url}/gateway/integracion/hardware/nodored/olts_habilitadas_para_aprovisionar?&json`;

    const response = await axios.get(url, {
      httpsAgent: agent,
      headers: { Authorization: `Basic ${basicAuthToken}` },
    });

    return response.data;
  } catch (error) {
    console.error("❌ Error en getConectoresPerfil:", error.message);
    return {};
  }
},


fetchDiagnosticoByPk: async (pkConexion, zoneName, ZONE_MAPPING) => {
  try {
    const server815 = ZONE_MAPPING[zoneName];
    if (!server815) {
      throw new Error(`Zona ${zoneName} no encontrada en mapping`);
    }

    const basicAuthToken = Buffer.from(
      `${server815.username}:${server815.password}`
    ).toString("base64");

    const diagnosticoResponse = await axios.get(
      `${server815.url}/gateway/integracion/hardware/nodored/diagnosticar_multiapi/?pk_conexion=${pkConexion}&json`,
      {
        httpsAgent: agent,
        headers: {
          Authorization: `Basic ${basicAuthToken}`,
        },
      }
    );

    return diagnosticoResponse.data;
  } catch (error) {
    console.error("❌ Error al consultar diagnóstico:", error.message);
    return { error: "No se pudo obtener diagnóstico" };
  }
},


};

export default apiService; 


