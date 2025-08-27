// server.js
// Archivo principal del servidor Express

import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import apiService from './apiService.js';
import cors from 'cors';

// Obtener la ruta del directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno del archivo .env desde la ruta absoluta
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Mapeo de zonas a URLs y credenciales
const ZONE_MAPPING = {
  "GTRE01": {
    url: "https://g3arcofer.815d.net:815",
    username: "wisphubapi",
    password: process.env.BASIC_AUTH_PASSWORD_GTRE01,
    ciudad: 40 
  },
  "BRMOESTE01": {
    url: "https://g1arcofer.815d.net:815",
    username: "wisphubapi",
    password: "process.env.BASIC_AUTH_PASSWORD_BRMOESTE01",
    ciudad: 40 
  },
  "BRMNORTE1": {
    url: "https://g2arcofer.815d.net:815",
    username: "wisphubapi",
    password: process.env.BASIC_AUTH_PASSWORD_BRMNORTE1,
    ciudad: 40
  },
};

const SERVERS_815 = [
  { name: 'S1', url: process.env.URL_815_G1, username: process.env.USER_815_G1, password: process.env.BASIC_AUTH_PASSWORD_BRMOESTE01 },
  { name: 'S2', url: process.env.URL_815_G2, username: process.env.USER_815_G1, password: process.env.BASIC_AUTH_PASSWORD_BRMNORTE1 },
  { name: 'S3', url: process.env.URL_815_G3, username: process.env.USER_815_G1, password: process.env.BASIC_AUTH_PASSWORD_GTRE01 },
];

// Middleware para parsear JSON
app.use(express.json());

// Middleware de CORS
app.use(cors());

// Ruta principal para la API de clientes
app.get('/api/clientes', async (req, res) => {
  const { zona } = req.query;
  try {
    let clientes;
    if (zona) {
      console.log(`--- Solicitud para clientes de la zona: ${zona} ---`);
      clientes = await apiService.fetchAndCombineClientsByZone(zona, ZONE_MAPPING);
    } else {
      console.log('--- Solicitud para todos los clientes (sin especificar zona) ---');
      clientes = await apiService.fetchAndCombineAllClients(SERVERS_815);
    }
    res.status(200).json(clientes);
  } catch (error) {
    console.error('❌ Error en el servidor al procesar la solicitud.');
    console.error('Mensaje de error:', error.message);
    const errorMessage = error.response?.data?.error || 'Error desconocido en el servidor';
    const errorStatus = error.response?.status || 500;
    res.status(errorStatus).json({ error: `Error en la operación: ${errorMessage}` });
  }
});

// Ruta para obtener clientes por cédula.
app.get('/api/clientes/cedula/:cedula', async (req, res) => {
  const { cedula } = req.params;
  console.log(`--- Solicitud para cliente con cédula: ${cedula} y su zona ---`);
  try {
    const clientePorCedula = await apiService.fetchClientByCedula(cedula, ZONE_MAPPING);
    res.status(200).json(clientePorCedula);
  } catch (error) {
    console.error('❌ Error en el servidor al procesar la solicitud por cédula.');
    console.error('Mensaje de error:', error.message);
    const errorMessage = error.response?.data?.error || 'Error desconocido en el servidor';
    const errorStatus = error.response?.status || 500;
    res.status(errorStatus).json({ error: `Error en la operación: ${errorMessage}` });
  }
});

// Listar nodos disponibles
app.get('/api/nodos/:zona', async (req, res) => {
  const { zona } = req.params;
  const nodos = await apiService.listAvailableNodes(zona, ZONE_MAPPING);
  res.json(nodos);
});

// Obtener ONU e IP disponibles en un nodo
app.get('/api/nodo/:zona/:pk', async (req, res) => {
  const { zona, pk } = req.params;
  const servicios = await apiService.getAvailableServicesFromNode(zona, pk, ZONE_MAPPING);
  res.json(servicios);
});

// RUTA en server.js
app.get('/api/planes/:zona', async (req, res) => {
  const { zona } = req.params;
  try {
    const planes = await apiService.listPlans(zona, ZONE_MAPPING);
    const data = planes.map(p => ({
      pk: p.pk,
      nombre: p.fields.nombre
    }));
    res.json(data);
  } catch (error) {
    console.error("❌ Error al listar planes:", error.message);
    res.status(500).json({ message: "Error al listar planes", error: error.message });
  }
});


// Crear cliente
app.post("/api/clientes/crear", async (req, res) => {
  try {
    const { formData, pkIp, zone } = req.body; // 🔹 zona separada del formData

    if (!zone) {
      return res.status(400).json({ message: "Zona no proporcionada" });
    }

    if (!pkIp) {
      return res.status(400).json({ message: "IP disponible no proporcionada" });
    }

    console.log("API: Se ha recibido una solicitud para crear un cliente.");
    console.log("Datos recibidos:", { formData, pkIp, zone });

    const result = await apiService.createClientIn815(zone, formData, pkIp, ZONE_MAPPING);

    res.json(result);
  } catch (error) {
    console.error("❌ Error en /api/clientes/crear:", error.message);
    res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
});

app.get('/api/zonas', (req, res) => {
  try {
    const zonas = Object.entries(ZONE_MAPPING).map(([id, data]) => ({
      id,
      nombre: id,
      ciudad: data.ciudad
    }));
    res.status(200).json(zonas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener zonas' });
  }
});

// ✅ NUEVAS RUTAS
// 📌 Listar planes
// Listar planes
app.get('/api/planes/:zona', async (req, res) => {
  const { zona } = req.params;
  try {
    const planes = await apiService.listPlans(zona, ZONE_MAPPING);
    const formatted = planes.map((p) => ({
      pk: p.pk,
      nombre: p.fields?.nombre || "Sin nombre",
    }));
    res.json(formatted);
  } catch (error) {
    console.error("❌ Error al listar planes:", error.message);
    res.status(500).json({ error: "Error al listar planes" });
  }
});

// Listar equipos cliente
app.get('/api/equipos/:zona', async (req, res) => {
  const { zona } = req.params;
  try {
    const equipos = await apiService.listEquipos(zona, ZONE_MAPPING);
    const formatted = equipos.map((e) => ({
      pk: e.pk,
      nombre: e.fields?.nombre || "Sin nombre",
    }));
    res.json(formatted);
  } catch (error) {
    console.error("❌ Error al listar equipos:", error.message);
    res.status(500).json({ error: "Error al listar equipos" });
  }
});

// Listar accesos DHCP
app.get('/api/accesos-dhcp/:zona', async (req, res) => {
  const { zona } = req.params;
  try {
    const accesos = await apiService.listAccesosDhcp(zona, ZONE_MAPPING);
    console.log("Accesos DHCP desde API:", accesos); // 🔹 log aquí
    res.json(accesos); 
  } catch (error) {
    console.error("❌ Error en /api/accesos-dhcp/:zona:", error.message);
    res.status(500).json([]);
  }
});


// Iniciar servidor
app.listen(port, () => {
  console.log(`✅ Servidor Express en puerto ${port}`);
  console.log(`Clientes: http://localhost:${port}/api/clientes`);
  console.log(`Planes:   http://localhost:${port}/api/planes/:zona`);
  console.log(`Equipos:  http://localhost:${port}/api/equipos/:zona`);
  console.log(`Accesos DHCP: http://localhost:${port}/api/accesos-dhcp/:zona`);
});