# Mapa CJB 3D - Ciudad Juan Bosch Interactive Map

[![Demo](https://img.shields.io/badge/Demo-Live-brightgreen)](https://jesusx26x.github.io/Mapa-CJB-3D/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 🏙️ Overview

**Mapa CJB 3D** is an interactive visualization platform for Ciudad Juan Bosch (CJB), a major urban development project in the Dominican Republic. This project provides:

- 📍 **Interactive SVG Map** - Explore lots with detailed information
- 🎬 **Timelapse Evolution** - Visual history from 2015 to 2025
- 📊 **Statistics Dashboard** - Real-time development metrics
- 🏢 **Presentation Module** - Professional slides for stakeholders (BHD Bank focus)
- 🌓 **Dark/Light Mode** - Elegant theme switching

## 🚀 Features

### Core Visualization
- **Zoomable & Pannable Map** - Smooth navigation with mouse/touch support
- **Lot Details Panel** - Click any lot to view complete information
- **Status-based Coloring** - Visual indicators for development stages
- **Filter System** - Sort by type, status, and development phase

### Timelapse Module
- **Satellite Imagery** - 10+ timesteps from 2015-2025
- **Animated Progression** - Auto-play development history
- **Year Slider Control** - Manual navigation through time

### BHD Presentation
- **Executive Slides** - Banking opportunity analysis
- **Demographic Data** - Population and market insights
- **Investment Potential** - Strategic recommendations

## 📁 Project Structure

```
Mapa/
├── index.html              # Landing page with timelapse
├── evolucion.html          # Evolution visualization
├── mapa-lotes.html         # Main interactive lot map
├── lotesv2.csv             # Lot database
├── MAPA NUEVO/             # Enhanced map version
│   ├── index.html          # Entry point
│   ├── evolucion.html      # Enhanced evolution view
│   ├── timelapse.html      # Standalone timelapse
│   ├── css/                # Stylesheets
│   ├── js/                 # JavaScript modules
│   ├── data/               # Data files
│   └── assets/             # Images and resources
├── Presentacion BHD/       # BHD Bank presentation
│   ├── Presentacion BHD.html
│   ├── timelapse-bhd.html
│   └── Manual de Presentacion BHD.md
└── Satellite Images/       # Historical satellite imagery (2015-2025)
```

## 🛠️ Technologies

- **HTML5/CSS3** - Modern web standards
- **Vanilla JavaScript** - No framework dependencies
- **SVG** - Scalable vector graphics for maps
- **Google Fonts** - Outfit typeface family
- **CSS Variables** - Dynamic theming system

## 🎨 Design System

| Color Variable | Dark Mode | Light Mode |
|----------------|-----------|------------|
| Primary | `#00d4ff` | `#0066cc` |
| Secondary | `#10b981` | `#059669` |
| Accent | `#a855f7` | `#9333ea` |
| Background | `#0a1628` | `#f8fafc` |

## 📊 Data Sources

- **lotesv2.csv** - Complete lot inventory with:
  - ID, Type, Status, Area
  - Owner information
  - Development progress
  - Geographic coordinates

## 🚀 Getting Started

### Local Development
```bash
# Clone the repository
git clone https://github.com/jesusx26x/Mapa-CJB-3D.git

# Navigate to project
cd Mapa-CJB-3D

# Open in browser (or use a local server)
open index.html
# OR
python -m http.server 8000
```

### GitHub Pages Deployment
The project is configured to deploy automatically via GitHub Pages from the `main` branch.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Credits

- **Fideicomiso VBC RD** - Project Development
- **Fonvivienda** - Housing Development
- **Ciudad Juan Bosch** - Urban Planning

---

<p align="center">
  <strong>Ciudad Juan Bosch - Construyendo el Futuro 🏗️</strong>
</p>
