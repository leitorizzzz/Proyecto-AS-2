# Design System — Asilo Cabeza de Algodon

> Fuente de verdad para la identidad visual del frontend.
> Elegido entre 3 direcciones generadas por `ui-ux-pro-max` el 2026-10-12.

**Direccion elegida:** _Editorial Data-Dense_ (variante 2 de las 3
propuestas). Justificacion:

1. El sistema es un **admin interno denso en tablas** (7 pantallas de
   datos sobre 1 panel + login). La categoria del skill ya marca
   "Data-Dense Dashboard" como mejor fit.
2. Entre las 3 direcciones es la **mas distintiva**: no es "otro admin
   azul". Casi monocromo editorial + un unico acento magenta medido.
3. El pairing serif + sans ("Libre Bodoni" como display + "Public Sans"
   como body/datos) comunica "ficha medica impresa" sin perder
   legibilidad para pantalla.
4. Mantiene **contraste WCAG AA** en texto (negro casi puro sobre
   fondo papel), evitando el riesgo de "chip color-only": los estados
   agregan prefijo tipografico (Error/Ok/Aviso) + patron de borde
   (solido / dashed / double) para ser legibles en escala de grises.

---

## Paleta

| Rol | Hex | Variable CSS | Uso |
|---|---|---|---|
| Papel | `#FAFAFA` | `--surface-page` | Fondo global |
| Tarjeta | `#FFFFFF` | `--surface-card` | Cards, modales |
| Realce suave | `#F2F2F3` | `--surface-raised` | Hover de fila, sub-panel |
| Tinta principal | `#09090B` | `--text-strong` | Titulos, encabezados |
| Tinta cuerpo | `#18181B` | `--text-body` | Parrafos, datos |
| Tinta suave | `#52525B` | `--text-soft` | Labels, meta |
| Tinta tenue | `#71717A` | `--text-mute` | Placeholder, pistas |
| Linea | `#D4D4D8` | `--line` | Bordes |
| Linea fuerte | `#A1A1AA` | `--line-strong` | Cabecera tabla |
| **Acento magenta** | `#D11A6D` | `--accent` | Marca, foco, 1 CTA primaria |
| Acento oscuro | `#A0144F` | `--accent-hover` | Hover |
| Acento tint | `#FBE8F0` | `--accent-tint` | Fondo chip "activo", highlight |

### Semanticos (nunca solo color)

| Estado | Hex | Prefijo texto | Borde chip |
|---|---|---|---|
| Ok / completada / enviada | `#15803D` sobre `#DCFCE7` | `✓ Ok —` | `double` 3px verde |
| Aviso / pendiente | `#A16207` sobre `#FEF3C7` | `⚠ Aviso —` | `dashed` 1px ambar |
| Error / cancelada / fallida | `#B91C1C` sobre `#FEE2E2` | `✕ Error —` | `solid` 1px rojo |
| Info / activa | `#1D4ED8` sobre `#DBEAFE` | `ℹ Info —` | `solid` 2px azul |

## Tipografia

- **Display / titulares / numeros grandes:** `Libre Bodoni` 400/500/700.
  Serif de alto contraste tipo revista. Solo para H1 de stage, titulos
  de card y valores de KPI.
- **Cuerpo / UI / tablas / inputs:** `Public Sans` 400/500/600/700.
  Sans-serif funcional y legible para texto denso.
- **Codigo / IDs tabulares (opcional):** `IBM Plex Mono` para columnas
  numericas donde la alineacion vertical importa.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Libre+Bodoni:ital,wght@0,400..700;1,400..700&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
```

### Escala

| Token | px | Uso |
|---|---|---|
| `--fs-micro` | 11 | Eyebrows en MAYUS **letter-spacing wide** |
| `--fs-tiny` | 12 | tiny / meta |
| `--fs-meta` | 13 | labels, tabla, pistas |
| `--fs-body` | 15 | cuerpo UI |
| `--fs-sub` | 17 | leads, titulos de card |
| `--fs-title` | 24 | H2 |
| `--fs-h1` | 32 | H1 stage |
| `--fs-hero` | 44 | Login side |

## Espaciado y radios

- Escala 4/8/12/16/24/32/48.
- Radios: `--radius-sm=2px`, `--radius=4px`, `--radius-lg=10px`.
- Row height minimo (tablas, inputs, botones): **44px**.

## Composicion deliberada

Para evitar look de plantilla:

1. **Login en dos columnas asimetricas** (65 / 35). Columna izquierda
   oscura con mark grande en Libre Bodoni y numeros romanos tabulares
   que son parte de la composicion ("Sistema III.MMXXVI"). Columna
   derecha blanca con el form, ancho fijo 400 px.
2. **Panel con KPIs mixtos**: el primer KPI es un numero gigante
   (saldo o pacientes activos) ocupando 2 columnas; los otros son
   compactos. Nada de "4 cards iguales arriba".
3. **Sidebar con regleta**: no es un slab plano gris. Es una columna
   blanca con una regleta magenta vertical a la izquierda, agrupadores
   con numeros romanos pequenos (I. Cuidado, II. Servicios, III.
   Administracion).
4. **Tablas sin look-Excel**: filas separadas por lineas finas
   `#D4D4D8`, sin fondos alternos. Hover suave en `#F2F2F3`. Las
   columnas numericas usan Plex Mono alineado a la derecha.
5. **Iconografia SVG** inline (sin emojis). 20x20, trazo 1.5, color
   `currentColor`.

## Microinteracciones

- Transiciones 150-220ms, `ease-out`.
- Hover: cambio de color/opacidad, nunca scale layout-shifting.
- Foco visible: outline doble (2px linea + 2px gap) en `--accent`,
  grueso.
- Boton primario: fondo `--accent`, hover `--accent-hover`.
- Boton secundario (ghost): borde `--line-strong`, texto `--text-strong`.
- Loading: puntos `···` animados, no spinners genericos.

## Anti-patrones (explicitos)

- No usar emojis como iconos.
- No usar scale en hover de cards (layout shift).
- No usar gradientes azul-morado tipo "AI startup".
- No cuatro KPI cards iguales arriba del panel.
- No cards con drop-shadow gratuito; preferir borde + linea.
- No ALL-CAPS en labels largos.
- No tipografia manuscrita ni script.
