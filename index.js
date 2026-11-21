const express = require('express');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Middleware para leer JSON en peticiones POST/PUT
app.use(express.json());

// 2. Conexión a MongoDB (usa variable de entorno en Vercel o la URI de respaldo)
const MONGO_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://root:root@cluster0.vcrqhkl.mongodb.net/spotify'; //

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('Conectado a MongoDB (spotify)'))
  .catch((err) => console.error('Error conectando a MongoDB:', err));

// 3. Esquemas y modelos (según tu captura)
const artistaSchema = new mongoose.Schema({
  nombre: String,
  pais: String,
  añoFormacion: Number,
  generoMusical: String,
  integrantes: Number,
  reproduccionesMensuales: Number,
  urlFoto: String,
}); //[cite: 2]

const Artista = mongoose.model('Artista', artistaSchema, 'artistas'); //[cite: 2]

const cancionSchema = new mongoose.Schema({
  titulo: String,
  artista_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Artista' },
  album: String,
  duracion: Number,
  reproducciones: Number,
  añoLanzamiento: Number,
  urlFotoAlbum: String,
}); //[cite: 2]

const Cancion = mongoose.model('Cancion', cancionSchema, 'canciones'); //[cite: 2]

// 4. Rutas de prueba y inserción (POST) / consulta (GET)
app.get('/', (req, res) => {
  res.send('API Spotify funcionando');
});

// Insertar un artista
app.post('/artistas', async (req, res) => {
  try {
    const nuevoArtista = new Artista(req.body);
    const guardado = await nuevoArtista.save();
    res.status(201).json(guardado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Consultar artistas (útil para verificar en Postman o navegador)
app.get('/artistas', async (req, res) => {
  try {
    const artistas = await Artista.find();
    res.json(artistas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Insertar una canción
app.post('/canciones', async (req, res) => {
  try {
    const nuevaCancion = new Cancion(req.body);
    const guardada = await nuevaCancion.save();
    res.status(201).json(guardada);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Consultar canciones (con populate opcional para ver datos del artista)
app.get('/canciones', async (req, res) => {
  try {
    const canciones = await Cancion.find().populate('artista_id');
    res.json(canciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Escuchar puerto en local y exportar app para Vercel
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;