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
        cliente.nodo_de_red_815 = mapaNodos[cliente.nodo_de_red]?.nombre || 'Desconocido';

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

    const foundClientWispHub = responseWispHub.data.results[0];
    if (!foundClientWispHub) {
      return { message: `Cliente con cédula ${cedula} no encontrado en WispHub.` };
    }

    // 2️⃣ Obtener información del servidor 815 correspondiente a la zona
    const zoneName = foundClientWispHub.zona.nombre;
    const correct815Entry = ZONE_MAPPING[zoneName];
    if (!correct815Entry) {
      return { message: `No se encontró una URL de servidor 815 para la zona: ${zoneName}` };
    }

    console.log(`✅ Cliente encontrado en WispHub. Zona: ${zoneName}.`);
    
    const basicAuthToken = Buffer.from(`${correct815Entry.username}:${correct815Entry.password}`).toString('base64');
    const direct815SearchUrl = `${correct815Entry.url}/gateway/integracion/clientes/cuentasimple/listar?&json&extra_1=${cedula}`;
    
    // 3️⃣ Buscar cliente en 815
    const response815 = await axios.get(direct815SearchUrl, {
      httpsAgent: agent,
      headers: { 'Authorization': `Basic ${basicAuthToken}` },
    });

    const foundClient815 = response815.data[0];
    if (!foundClient815) {
      return { message: `Cliente con cédula ${cedula} no encontrado en 815.` };
    }

    // 4️⃣ Enriquecer cliente 815
    const enrichedClient = await apiService.enrich815Client(foundClient815, correct815Entry.url, basicAuthToken);

    // 5️⃣ Consultar diagnóstico usando pk de conexión
    let diagnostico = {};
    try {
      const pkConexion = foundClient815.pk; // reemplaza si tu pk real está en otro campo
      const diagnosticoResponse = await axios.get(
        `${correct815Entry.url}/gateway/integracion/hardware/nodored/diagnosticar_multiapi/?pk_conexion=${pkConexion}&json`,
        {
          httpsAgent: agent,
          headers: { 'Authorization': `Basic ${basicAuthToken}` },
        }
      );
      diagnostico = diagnosticoResponse.data; // contiene conexion, olt, onu, etc.
    } catch (error) {
      console.error('❌ Error al consultar diagnóstico:', error.message);
    }

    // 6️⃣ Unir todo al JSON final
    const clientesUnidos = { 
      ...foundClientWispHub, 
      ...enrichedClient,
      ...diagnostico // 🔹 hace spread de todas las propiedades del diagnóstico
    };
    
    return clientesUnidos;

  } catch (error) {
    console.error('❌ Error al procesar la búsqueda por cédula.', error.message);
    if (error.response) {
      console.error('Detalles del error HTTP:', error.response.status, error.response.data);
    }
    throw error;
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
      nodo_de_red_815: mapaNodos[cliente815.fields.nodo_de_red]?.nombre || 'Desconocido'
    };

    return clienteEnriquecido;
  } catch (error) {
    console.error('❌ Error al enriquecer cliente 815:', error.message);
    return cliente815; // Devuelve al menos el cliente original si falla
  }
},


};

export default apiService;


