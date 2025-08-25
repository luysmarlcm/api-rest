// server.js
// Archivo principal del servidor Express

import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import apiService from './apiService.js';
import cors from 'cors'; // Importar el middleware de cors

// Obtener la ruta del directorio actualg
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
    password: process.env.BASIC_AUTH_PASSWORD_GTRE01
  },
  "BRMOESTE01": {
    url: "https://201.251.240.189:50009",
    username: "wisphubapi",
    password: "uC0s46Vz5OjQ"
  },
  "BRMNORTE1": {
    url: "https://g2arcofer.815d.net:815",
    username: "wisphubapi",
    password: process.env.BASIC_AUTH_PASSWORD_BRMNORTE1
  },
};

const SERVERS_815 = [
  { name: 'S1', url: process.env.URL_815_G1, username: process.env.USER_815_G1, password: process.env.BASIC_AUTH_PASSWORD_BRMOESTE01 },
  { name: 'S2', url: process.env.URL_815_G2, username: process.env.USER_815_G1, password: process.env.BASIC_AUTH_PASSWORD_BRMNORTE1 },
  { name: 'S3', url: process.env.URL_815_G3, username: process.env.USER_815_G1, password: process.env.BASIC_AUTH_PASSWORD_GTRE01 },
];

// Middleware para parsear JSON si fuera necesario
app.use(express.json());

app.use(cors());

// Ruta principal para la API de clientes
// Acepta un parámetro de consulta `zona`
app.get('/api/clientes', async (req, res) => {
  const { zona } = req.query; // Obtener el parámetro de zona de la URL
  try {
    let clientes;
    if (zona) {
      console.log(`--- Solicitud para clientes de la zona: ${zona} ---`);
      // Llama a la función que filtra por zona
      clientes = await apiService.fetchAndCombineClientsByZone(zona, ZONE_MAPPING);
    } else {
      console.log('--- Solicitud para todos los clientes (sin especificar zona) ---');
      // ✅ Aquí usamos SERVERS_815 que es un array iterable
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


// Ruta para obtener clientes por cédula. La búsqueda se realiza en todos los servidores de 815.
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


// Mensaje de inicio del servidor
app.listen(port, () => {
  console.log(`✅ Servidor Express escuchando en el puerto ${port}`);
  console.log(`Ruta de la API para todos los clientes: http://localhost:${port}/api/clientes`);
  console.log(`Ruta de la API para clientes por zona: http://localhost:${port}/api/clientes?zona=GTRE01`);
  console.log(`Nueva ruta de la API por cédula: http://localhost:${port}/api/clientes/cedula/:cedula`);
});