const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Frontend estático (se sirve antes de conectar a la BD)
app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://root:root@cluster0.vcrqhkl.mongodb.net/spotify';

// Cache de conexión para Vercel (Serverless)
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function conectarDB() {
  if (cached.conn) {
    return cached.conn;
  }
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGO_URI, {
        bufferCommands: false,
      })
      .then((mongooseInstance) => mongooseInstance);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// Middleware: garantiza conexión activa en cada petición antes de tocar la BD
app.use(async (req, res, next) => {
  try {
    await conectarDB();
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error de conexión a MongoDB', detalle: error.message });
  }
});

// Esquemas y modelos
const artistaSchema = new mongoose.Schema({
  nombre: String,
  pais: String,
  añoFormacion: Number,
  generoMusical: String,
  integrantes: Number,
  reproduccionesMensuales: Number,
  urlFoto: String,
});

const Artista = mongoose.model('Artista', artistaSchema, 'artistas');

const cancionSchema = new mongoose.Schema({
  titulo: String,
  artista_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Artista' },
  album: String,
  duracion: Number,
  reproducciones: Number,
  añoLanzamiento: Number,
  urlFotoAlbum: String,
});

const Cancion = mongoose.model('Cancion', cancionSchema, 'canciones');

// Rutas
app.get('/api/status', (req, res) => {
  res.send('API Spotify funcionando');
});

// Maneja errores comunes (id inválido -> 400, no encontrado -> 404)
function manejarError(res, error) {
  if (error.name === 'CastError' || error.name === 'ValidationError') {
    return res.status(400).json({ error: error.message });
  }
  res.status(500).json({ error: error.message });
}

app.post('/artistas', async (req, res) => {
  try {
    const nuevoArtista = new Artista(req.body);
    const guardado = await nuevoArtista.save();
    res.status(201).json(guardado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/artistas', async (req, res) => {
  try {
    const artistas = await Artista.find();
    res.json(artistas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/artistas/:id', async (req, res) => {
  try {
    const artista = await Artista.findById(req.params.id);
    if (!artista) return res.status(404).json({ error: 'Artista no encontrado' });
    res.json(artista);
  } catch (error) {
    manejarError(res, error);
  }
});

app.put('/artistas/:id', async (req, res) => {
  try {
    const artista = await Artista.findByIdAndUpdate(req.params.id, req.body, {
      returnDocument: 'after',
      runValidators: true,
    });
    if (!artista) return res.status(404).json({ error: 'Artista no encontrado' });
    res.json(artista);
  } catch (error) {
    manejarError(res, error);
  }
});

// Elimina el artista y sus canciones asociadas
app.delete('/artistas/:id', async (req, res) => {
  try {
    const artista = await Artista.findByIdAndDelete(req.params.id);
    if (!artista) return res.status(404).json({ error: 'Artista no encontrado' });
    const { deletedCount } = await Cancion.deleteMany({ artista_id: artista._id });
    res.json({ mensaje: 'Artista eliminado', artista, cancionesEliminadas: deletedCount });
  } catch (error) {
    manejarError(res, error);
  }
});

app.post('/canciones', async (req, res) => {
  try {
    const nuevaCancion = new Cancion(req.body);
    const guardada = await nuevaCancion.save();
    res.status(201).json(guardada);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/canciones', async (req, res) => {
  try {
    const canciones = await Cancion.find().populate('artista_id');
    res.json(canciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/canciones/:id', async (req, res) => {
  try {
    const cancion = await Cancion.findById(req.params.id).populate('artista_id');
    if (!cancion) return res.status(404).json({ error: 'Canción no encontrada' });
    res.json(cancion);
  } catch (error) {
    manejarError(res, error);
  }
});

app.put('/canciones/:id', async (req, res) => {
  try {
    const cancion = await Cancion.findByIdAndUpdate(req.params.id, req.body, {
      returnDocument: 'after',
      runValidators: true,
    }).populate('artista_id');
    if (!cancion) return res.status(404).json({ error: 'Canción no encontrada' });
    res.json(cancion);
  } catch (error) {
    manejarError(res, error);
  }
});

app.delete('/canciones/:id', async (req, res) => {
  try {
    const cancion = await Cancion.findByIdAndDelete(req.params.id);
    if (!cancion) return res.status(404).json({ error: 'Canción no encontrada' });
    res.json({ mensaje: 'Canción eliminada', cancion });
  } catch (error) {
    manejarError(res, error);
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;