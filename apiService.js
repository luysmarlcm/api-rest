// apiService.js

import axios from 'axios';
import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

const apiService = {
  // Nueva función para obtener y combinar todos los datos de los clientes de todas las zonas
  fetchAndCombineAllClients: async (ZONE_MAPPING) => {
    try {
      const apiKey = process.env.WISPHUB_API_KEY;
      const apiUrl = process.env.API_URL;
      
      console.log('--- Iniciando llamadas a todas las APIs de 815 según las zonas ---');

      const all815Data = [];
      const allWispHubClients = await apiService.fetchPaginatedWispHubClients(apiKey, apiUrl);
      const mapaWispHub = new Map(allWispHubClients.map(c => [c.id_servicio, c]));

      const zoneEntries = Object.values(ZONE_MAPPING);
      const zoneRequests = zoneEntries.map(entry => apiService.fetchAndEnrich815Data(entry.url, entry.username, entry.password));
      const combinedZoneResults = await Promise.all(zoneRequests);

      combinedZoneResults.forEach(zoneData => all815Data.push(...zoneData));

      console.log('✅ Datos de todos los servidores de 815 obtenidos y enriquecidos. Total:', all815Data.length);

      const clientesUnidos = all815Data.map(cliente815 => {
        const clienteWispHub = mapaWispHub.get(cliente815.conector);
        return clienteWispHub ? { ...cliente815, ...clienteWispHub } : null;
      }).filter(Boolean);

      console.log('--- Proceso de unión finalizado. Total de clientes unidos:', clientesUnidos.length);
      
      if (clientesUnidos.length === 0) {
        return { 
          message: 'No hay datos para unir. Las bases de datos están vacías o los conectores no coinciden.' 
        };
      }
      
      return clientesUnidos;

    } catch (error) {
      console.error('❌ Error al unir los datos de las APIs.');
      console.error('Mensaje de error:', error.message);
      if (error.response) {
        console.error('Detalles del error HTTP:', error.response.status, error.response.data);
      }
      throw error;
    }
  },

  fetchAndCombineClientsByZone: async (zoneName, ZONE_MAPPING) => {
    try {
      const apiKey = process.env.WISPHUB_API_KEY;
      const apiUrl = process.env.API_URL;

      console.log(`--- Iniciando la búsqueda y combinación para la zona: ${zoneName} ---`);

      const allWispHubClients = await apiService.fetchPaginatedWispHubClients(apiKey, apiUrl);
      const wispHubClientsInZone = allWispHubClients.filter(client => client.zona.nombre === zoneName);
      const mapaWispHub = new Map(wispHubClientsInZone.map(c => [c.id_servicio, c]));
      
      console.log(`✅ ${wispHubClientsInZone.length} clientes encontrados en WispHub para la zona ${zoneName}.`);

      const correct815Entry = ZONE_MAPPING[zoneName];
      if (!correct815Entry) {
        return { message: `No se encontró una configuración de 815 para la zona: ${zoneName}` };
      }

      const data815FromZone = await apiService.fetchAndEnrich815Data(
          correct815Entry.url,
          correct815Entry.username,
          correct815Entry.password
      );

      console.log(`✅ ${data815FromZone.length} clientes encontrados en 815 para la zona ${zoneName}.`);

      const clientesUnidos = data815FromZone.map(cliente815 => {
          const clienteWispHub = mapaWispHub.get(cliente815.conector);
          return clienteWispHub ? { ...cliente815, ...clienteWispHub } : null;
      }).filter(Boolean);

      console.log(`--- Proceso de unión finalizado. Total de clientes unidos para la zona ${zoneName}:`, clientesUnidos.length);
      
      if (clientesUnidos.length === 0) {
          return { message: 'No hay datos para unir para esta zona. Los conectores no coinciden.' };
      }
      
      return clientesUnidos;

    } catch (error) {
        console.error(`❌ Error al unir los datos de las APIs para la zona ${zoneName}.`);
        console.error('Mensaje de error:', error.message);
        if (error.response) {
            console.error('Detalles del error HTTP:', error.response.status, error.response.data);
        }
        throw error;
    }
  },

  fetchClientByCedula: async (cedula, ZONE_MAPPING) => {
    try {
      const apiKey = process.env.WISPHUB_API_KEY;
      const apiUrl = process.env.API_URL;

      console.log(`--- Buscando cliente con cédula ${cedula} en WispHub ---`);
      
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

      const zoneName = foundClientWispHub.zona.nombre;
      const correct815Entry = ZONE_MAPPING[zoneName];
      if (!correct815Entry) {
        return { message: `No se encontró una URL de servidor 815 para la zona: ${zoneName}` };
      }

      console.log(`✅ Cliente encontrado en WispHub. Zona: ${zoneName}.`);
      
      const basicAuthToken = Buffer.from(`${correct815Entry.username}:${correct815Entry.password}`).toString('base64');
      const direct815SearchUrl = `${correct815Entry.url}/gateway/integracion/clientes/cuentasimple/listar?&json&extra_1=${cedula}`;
      
      const response815 = await axios.get(direct815SearchUrl, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      });

      const foundClient815 = response815.data[0];
      if (!foundClient815) {
        return { message: `Cliente con cédula ${cedula} no encontrado en 815.` };
      }

      const enrichedClient = await apiService.enrich815Client(foundClient815, correct815Entry.url, basicAuthToken);
      const clientesUnidos = { ...foundClientWispHub, ...enrichedClient };
      
      return clientesUnidos;

    } catch (error) {
      console.error('❌ Error al procesar la búsqueda por cédula.');
      console.error('Mensaje de error:', error.message);
      if (error.response) {
        console.error('Detalles del error HTTP:', error.response.status, error.response.data);
      }
      throw error;
    }
  },

  // ✅ Fix aquí: mantener conector al enriquecer un cliente de 815
  enrich815Client: async (client815, url815, basicAuthToken) => {
    const [
      responseCiudades,
      responseEquipos,
      responseIPs,
      responseNodos
    ] = await Promise.all([
      axios.get(`${url815}/gateway/integracion/geografico/ciudad/listar?&json`, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      }),
      axios.get(`${url815}/gateway/integracion/hardware/equipocliente/listar?json`, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      }),
      axios.get(`${url815}/gateway/integracion/red/direccionip/listar?&json`, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      }),
      axios.get(`${url815}/gateway/integracion/hardware/nodored/listar?activo=True&admite_clientes=True&json`, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      }),
    ]);

    const mapaCiudades = new Map(responseCiudades.data.map(item => [item.pk, item.fields.nombre]));
    const mapaEquipos = new Map(responseEquipos.data.map(item => [item.pk, item.fields]));
    const mapaIPs = new Map(responseIPs.data.map(item => [item.pk, item.fields]));
    const mapaNodos = new Map(responseNodos.data.map(item => [item.pk, item.fields]));

    const enrichedClient = { 
      ...client815.fields, 
      pk: client815.pk, 
      model: client815.model,
      conector: client815.fields.conector // 👈 agregado
    };
    enrichedClient.ciudad_815 = mapaCiudades.get(enrichedClient.ciudad) || 'Desconocida';
    enrichedClient.equipo_cliente = mapaEquipos.get(enrichedClient.equipo_cliente)?.nombre || 'Desconocido';
    enrichedClient.direccion_ip_815 = mapaIPs.get(enrichedClient.direccion_ip) || 'Desconocida';
    enrichedClient.nodo_de_red_815 = mapaNodos.get(enrichedClient.nodo_de_red)?.nombre || 'Desconocido';

    return enrichedClient;
  },

  // ✅ Fix aquí también: mantener conector en la lista de clientes de 815
  fetchAndEnrich815Data: async (url815, username, password) => {
    if (!username || !password) {
      throw new Error('Las credenciales de autenticación para esta zona no están definidas.');
    }
    const basicAuthToken = Buffer.from(`${username}:${password}`).toString('base64');
    
    const [
      responseClientes,
      responseCiudades,
      responseEquipos,
      responseIPs,
      responseNodos
    ] = await Promise.all([
      axios.get(`${url815}/gateway/integracion/clientes/cuentasimple/listar?&json`, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      }),
      axios.get(`${url815}/gateway/integracion/geografico/ciudad/listar?&json`, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      }),
      axios.get(`${url815}/gateway/integracion/hardware/equipocliente/listar?json`, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      }),
      axios.get(`${url815}/gateway/integracion/red/direccionip/listar?&json`, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      }),
      axios.get(`${url815}/gateway/integracion/hardware/nodored/listar?activo=True&admite_clientes=True&json`, {
        httpsAgent: agent,
        headers: { 'Authorization': `Basic ${basicAuthToken}` },
      }),
    ]);

    const mapaCiudades = new Map(responseCiudades.data.map(item => [item.pk, item.fields.nombre]));
    const mapaEquipos = new Map(responseEquipos.data.map(item => [item.pk, item.fields]));
    const mapaIPs = new Map(responseIPs.data.map(item => [item.pk, item.fields]));
    const mapaNodos = new Map(responseNodos.data.map(item => [item.pk, item.fields]));
    
    return responseClientes.data.map(item => {
      const cliente = { 
        ...item.fields, 
        pk: item.pk, 
        model: item.model,
        conector: item.fields.conector // 👈 agregado
      };
      cliente.ciudad_815 = mapaCiudades.get(cliente.ciudad) || 'Desconocida';
      cliente.equipo_cliente = mapaEquipos.get(cliente.equipo_cliente)?.nombre || 'Desconocido';
      cliente.direccion_ip_815 = mapaIPs.get(cliente.direccion_ip) || 'Desconocida';
      cliente.nodo_de_red_815 = mapaNodos.get(cliente.nodo_de_red)?.nombre || 'Desconocido';
      return cliente;
    });
  },

  fetchPaginatedWispHubClients: async (apiKey, apiUrl) => {
    let allWispHubClients = [];
    let offset = 0;
    const limit = 300; 

    console.log('--- Iniciando llamadas a la API de WispHub con paginación ---');
    while (true) {
      const response = await axios.get(`${apiUrl}/api/clientes/?limit=${limit}&offset=${offset}`, {
        headers: {
          'Authorization': `Api-Key ${apiKey}`,
          'Accept': 'application/json'
        }
      });

      const { results, next } = response.data;
      if (!results || results.length === 0) break;
      
      allWispHubClients = allWispHubClients.concat(results);
      if (!next) break;
      offset += limit;
    }
    return allWispHubClients;
  },
};

export default apiService;

