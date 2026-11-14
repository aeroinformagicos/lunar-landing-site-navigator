<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# A3 · Investigación del fallo (puesta de Sol de Blue Ghost 1, 16/03/2025)

Para **A1**. Fecha: 2026-11-14. Rama `t-22-a3-investigacion`, salida de `main` con T-22 ya integrada
(PR #34). Sigue a `docs/handoff/T-22.md`.
**No se ha cambiado ninguna prueba, tolerancia ni fichero de `tests/golden/`.** Los cálculos son de la
sesión (guiones no versionados que llaman a `pipeline/horizon` y `pipeline/vis`); las cifras están aquí.

## Resumen
- **El fallo:** nuestra puesta del centro del Sol con relieve (SLDEM2015, 2 m) es a las **18:53:55 UTC**;
  la ventana de la especificación es 18:00–18:15 UTC ± 30 min. Sobran 8,9 min.
- **La fuente no da la hora de la puesta.** Firefly da la hora de los últimos datos (≈ 23:15 UTC) y dice
  que operó «just over 5 hours into the lunar night». La ventana es una resta, y Firefly no dice qué
  instante llama puesta.
- **El relieve hace casi todo el trabajo:** con Luna lisa la puesta sería a las 20:11–20:22 UTC (dos
  horas tarde). Con relieve, el Sol empieza a ponerse a las **18:20**, el centro cruza a las 18:54 y
  desaparece a las 19:28.
- **Lo que queda está por debajo de lo que resuelven los datos:** el horizonte hacia el Sol poniente lo
  fija una loma de 11 m a solo 800 m. Ahí, 1 m de cota mueve la puesta 9 min, y mover el sitio un píxel
  del relieve (59 m) la mueve entre −51 y +33 min.
- **Recomendación:** no tocar el modelo, ni el convenio del centro, ni la tolerancia. Comparar la ventana
  de Firefly con nuestro **intervalo de puesta** (de primer a último contacto) y enseñar los tres
  instantes en la página. Decide A1 (§5).

## 1. Qué dice Firefly

| Qué | Cita literal | Dónde |
| --- | --- | --- |
| Últimos datos y duración en la noche | «completing more than 14 days of surface operations (346 hours of daylight)» … «and operating just over 5 hours into the lunar night with the final data received around 6:15 pm CDT on March 16.» (dos fragmentos de la misma frase) | Nota de prensa de Firefly, 17/03/2025; misma frase en el diario de misión, entrada del 17/03 |
| Qué hizo tras la puesta | «Following the sunset, Blue Ghost operated for 5 hours into the lunar night and continued to capture imagery that measures how dust behavior changes after sunset.» | Nota de prensa, 17/03/2025 |
| Imágenes de la puesta | «Firefly also captured imagery of the lunar sunset on March 16» (sin hora) | Nota de prensa, 17/03/2025 |
| Alunizaje | Entrada «March 2, 2025, 2:34 am CST: Successful Touchdown Confirmed» | Diario de misión |

Lectura:

- **Lo que pasó «hacia las 6:15 pm» es la recepción de los últimos datos**, no la puesta. La zona es
  **CDT** (UTC−5): 23:15 UTC. Es la fila `last_data` de `tests/golden/events_published.csv`.
- **Firefly no da ninguna hora para la puesta**, ni dice qué la define: no habla de pérdida de energía,
  de sombra en los paneles ni de paso a baterías. La fila `sunset_latest` (18:15 UTC) es 23:15 − 5 h:
  un valor deducido, no citado.
- «Just over 5 hours» y «around 6:15 pm» son redondeos. La ventana 18:00–18:15 de la especificación es
  una lectura razonable, no un dato.
- **Segunda cifra independiente en la misma frase: «346 hours of daylight».** Contadas desde el
  alunizaje (2:34 am CST = 08:34 UTC del 2 de marzo; el horario de verano empezó el 9), dan
  **18:34 UTC**, y entre 18:04 y 19:04 si la cifra está redondeada a la hora. Firefly no dice desde
  cuándo cuenta.
- Las dos cifras de Firefly no cierran entre sí: 346 h + 5 h = 351 h, y del alunizaje a los últimos
  datos hay 350,7 h. La propia fuente tiene una holgura de unos 20–30 min.

## 2. Cálculo

Sitio del catálogo (`blue-ghost-1`, 18,562° N, 61,810° E), tabla de efemérides publicada, 16/03/2025.
El Sol baja a 0,480 °/h con un radio aparente de 0,267°: ponerse entero le lleva 68 min.

### 2.1 Los tres instantes, con relieve y con Luna lisa

| Instante (UTC) | Relieve SLDEM2015, 2 m | Luna lisa, 0 m | Luna lisa, 2 m |
| --- | --- | --- | --- |
| El disco baja del 100 % (borde inferior toca el horizonte) | **18:19:47** | 19:37:16 | 19:48:08 |
| 50 % (centro; «hay Sol» de la aplicación) | **18:53:55** | 20:10:39 | 20:21:31 |
| 0 % (desaparece el borde superior) | **19:28:03** | 20:44:03 | 20:54:55 |
| Acimut del Sol en esos instantes | 269,69° / 269,78° / 269,87° | 269,90° / 269,99° / 270,08° | 269,93° / 270,02° / 270,11° |
| Horizonte en el acimut del Sol | 0,619° / 0,614° / 0,608° | 0° | −0,087° |
| Qué fija el horizonte | Loma a **800 m**, cota −3.641,4 m: 11,0 m sobre el sitio (−3.652,4 m), en 18,5618° N, 61,7822° E | Curvatura | Curvatura (tangencia a 2.636 m) |

La máscara publicada (`horizon/blue-ghost-1.json`, redondeada según el contrato) da los mismos tres
instantes al segundo que el motor sin redondear.

Frente a las dos cifras de Firefly:

| Nuestro instante | Horas desde el alunizaje (Firefly: 346) | Horas hasta los últimos datos (Firefly: «just over 5») |
| --- | --- | --- |
| Primer contacto, 18:19:47 | 345,76 → 346 ✓ | 4,92 (5 min corto) |
| Centro, 18:53:55 | 346,33 → 346 ✓ | 4,35 (39 min corto) |
| Último contacto, 19:28:03 | 346,90 → 347 ✗ | 3,78 ✗ |

### 2.2 Sensibilidad

| Variación | Borde inferior | Centro | Horizonte en 269,7° | Cresta que manda |
| --- | --- | --- | --- | --- |
| **Nominal** (catálogo, 2 m) | 18:19:47 | 18:53:55 | 0,618° | 800 m |
| Observador a 0 m | 17:37:28 | 18:11:03 | 0,956° | 240 m (resalte de 4 m en un solo píxel) |
| Observador a 1 m | 18:07:32 | 18:41:07 | 0,717° | 240 m |
| Observador a 5 m | 18:47:15 | 19:21:22 | 0,403° | 800 m |
| Sitio 100 m al N | 18:44:13 | 19:17:11 | 0,422° | 1.980 m |
| Sitio 100 m al S | 17:51:39 | 18:24:42 | 0,847° | 680 m |
| Sitio 100 m al E | 18:34:20 | 19:08:28 | 0,501° | 900 m |
| Sitio 100 m al O | 18:08:43 | 18:42:17 | 0,711° | 140 m |
| ±100 m, ocho direcciones (extremos) | 17:30:17 … 18:58:20 | 18:02:46 … 19:31:18 | 0,30° … 1,03° | — |
| ±59 m (un píxel), N/S/E/O (extremos) | 17:29:12 … 18:53:37 | 18:02:47 … 19:26:30 | 0,34° … 1,02° | — |
| ±30 m (medio píxel), N/S/E/O (extremos) | 18:01:59 … 18:49:02 | 18:34:57 … 19:22:46 | 0,39° … 0,76° | — |
| Coordenadas de LROC (18,5623° N, 61,8103° E: 9 m al N y 9 m al E), 2 m | 18:33:27 | 19:07:26 | 0,511° | — |

Equivalencias: 0,01° de horizonte = 1,25 min. **1 m de cota en la cresta de 800 m = 0,072° = 9,0 min.**
1 m en el resalte de 240 m = 30 min. 1 m de altura del observador ≈ 9 min entre 2 y 5 m, y entre 13 y
30 min por debajo de 2 m (manda un resalte más cercano).

Para que el centro se pusiera a las 18:15 haría falta un horizonte de 0,925° (+0,305°): **4,3 m más de
cota relativa en la cresta de 800 m**. Para las 18:00, 1,045° (+0,423°): 5,9 m.

### 2.3 Comprobación de la lectura del recorte (paso 1 de `11_validacion.md` §4)

| Comprobación | Resultado |
| --- | --- |
| Costuras | Ninguna: el recorte sale de una sola tesela (`SLDEM2015_512_00N_30N_045_090`), 0 muestras sin dato, 0 acimuts truncados |
| Cota del sitio | −3.652,4 m (nuestra) frente a −3.650 m que da LROC para el módulo: 2,4 m |
| Orientación y escala | El horizonte lejano más alto está entre los acimuts 108° y 158° (máximo 2,39° en 126,5°, a 2,7 km; cresta a +157 m más allá de 5 km). Mons Latreille (nomenclátor de la IAU: centro en 18,47° N, 61,92° E, 6,4 km de diámetro; unos 150 m de altura según Wikipedia) queda a 4,2 km en el acimut 131° |

El recorte se lee bien. No hay indicio de error de lectura ni de orientación.

## 3. Interpretación

- **Las efemérides no son el problema:** A1 y A2 coinciden con Horizons (2,5·10⁻⁵° y 0,5 s), y a las
  18:15 UTC nuestro Sol está a 0,9248°, como en Horizons.
- **Todo el desacuerdo es de horizonte, y el horizonte es de relieve muy cercano y muy bajo.** Una loma
  de 11 m a 800 m son 13 píxeles de un modelo de 59 m por píxel, con una exactitud vertical típica de
  3 a 4 m (Barker et al. 2016). Los 4,3 m que faltan son del orden de esa exactitud.
- **La posición pesa aún más que la cota.** Un píxel de desplazamiento mueve la puesta del centro entre
  −51 y +33 min, y de forma no monótona (100 m al O: 18:42; 59 m al O: 18:03): a esa escala el relieve
  es ruido para este cálculo. Las coordenadas más precisas de LROC, a 13 m de las del catálogo,
  **no acercan** el resultado: lo retrasan 13 min.
- **Hay relieve real que el modelo no ve.** LROC sitúa el módulo «right on the rim» de un cráter de
  12 m de diámetro, cinco veces menor que un píxel.
- **Conclusión sobre los datos:** en este sitio y con este relieve, la predicción tiene una
  incertidumbre de unos ± 45 min. La tolerancia de 30 min de la especificación es más fina que eso: A3
  puede comprobar que el relieve acerca la predicción al hecho (de 2 h a decenas de minutos), no que
  acierte al cuarto de hora.
- **Qué instante nuestro corresponde a lo que describe Firefly.** No se puede saber por la fuente. El
  que mejor encaja con sus dos cifras es el **primer contacto (18:19:47)**: a 5 min de la ventana y
  coherente con las 346 h. El centro (18:53:55) encaja con las 346 h pero no con las 5 h. El último
  contacto no encaja con ninguna.

Lo que **no** recomiendo, porque sería ajustar al resultado:

- Bajar el observador a 0 m (da 18:11, dentro de la ventana, pero por un resalte de 4 m en un solo píxel).
- Mover el sitio (un píxel al O da 18:03; las coordenadas mejores de LROC dan 19:07).
- Ensanchar `A3_min`.

## 4. Opciones para A1

| Opción | Qué cambia | Resultado de A3 | A favor | En contra |
| --- | --- | --- | --- | --- |
| **A. Dejarlo como está** | Solo la nota del informe (más clara, con las cifras del §2) | `fail` (`Mismatch`), explicado | No se toca ningún criterio después de ver el resultado | El titular dice «no coincide» cuando la diferencia está dentro de lo que resuelven los datos |
| **B. Comparar con el intervalo de puesta** (recomendada) | El criterio: distancia entre la ventana de Firefly y nuestro intervalo [primer contacto, último contacto] ≤ `A3_min`. La tolerancia no cambia | `pass`: 4,8 min | La fuente no dice qué instante es su «puesta»; una sola máscara (la publicada); la Luna lisa sigue fallando por 93 min | Es un cambio de criterio posterior al resultado. Con el sitio un píxel al N fallaría (38,6 min): el aprobado no es robusto a escala de píxel |
| C. Ensanchar la tolerancia a 45 min | `tolerances.json` | `pass`: 38,9 min | Refleja la incertidumbre medida | Mover la tolerancia hasta que pase; no lo recomiendo |

## 5. Recomendación y cambios concretos (si A1 elige B)

No tocar el modelo ni el convenio «hay Sol = centro del disco». La aplicación sigue dando 18:53:55 como
puesta. Lo que cambia es con qué se compara la frase de Firefly.

1. **`docs/spec/11_validacion.md` §4, fila A3** (A1/A2):
   - Entrada: los tres instantes (100 %, centro, 0 %) con la máscara SLDEM2015 a 2 m.
   - Esperado: la ventana 18:00–18:15 UTC queda a menos de 30 min del intervalo de puesta.
   - Quitar «Condición equivalente: horizonte de ~0,9°» (el nuestro es 0,62°) y añadir la advertencia
     de sensibilidad del §2.2.
2. **`pipeline/tests/test_a3_blueghost_sunset.py`** (I1):
   - `gap = max(0, primer_contacto − fin_ventana, inicio_ventana − último_contacto)`; pasa si
     `gap ≤ A3_min`.
   - Sigue registrando el centro y su diferencia (38,9 min) como detalle, sin afirmación.
   - Detalle nuevo: la Luna lisa con el mismo criterio (93 min), para que se vea que la prueba distingue.
3. **`tests/golden/`**: nada. `A3_min` sigue en 30 y `events_published.csv` no cambia.
4. **`pipeline/cli/report.py`** (I1): el titular A3 pasa a tres filas. Sin cambio de contrato ni de
   código en la página (las filas son genéricas); I2 solo comprueba cómo se ve una fila con `ok: null`.

   | Label | Predicted | Observed | OK |
   | --- | --- | --- | --- |
   | Sun starts to set | 18:20 UTC | 18:00–18:15 UTC | ✓ |
   | Centre of the Sun on the horizon | 18:54 UTC | — | — |
   | Sun fully set | 19:28 UTC | — | — |

5. **Frase para el jurado** (nota del titular):

   > Firefly gives no sunset time: it reports final data around 23:15 UTC, "just over 5 hours into the
   > lunar night", so night began at about 18:00–18:15 UTC. With real terrain our model has the Sun start
   > to set at 18:20 UTC and its centre reach the horizon at 18:54 UTC, against 20:11 UTC on a smooth
   > Moon. The remaining minutes are within what the 59 m terrain model can resolve: the horizon toward
   > the setting Sun is an 11 m rise only 800 m away, where 1 m of height moves the sunset by 9 minutes.

6. **`docs/decisions.md`**: la decisión la escribe A1, con la opción elegida y el motivo.

Si A1 elige **A**, solo cambia la nota del informe. Frase propuesta:

> Our sunset (centre of the Sun, 18:54 UTC) is 39 min later than the 18:00–18:15 UTC implied by
> Firefly's report, against 2 hours later on a smooth Moon. The difference is within what the 59 m
> terrain model can resolve: the horizon there is an 11 m rise only 800 m away, where 1 m of height
> moves the sunset by 9 minutes.

## 6. Qué queda
- **A1:** elegir A o B y anotarlo. Decidir si la fila `sunset_latest` de `events_published.csv` debe
  decir que es un valor deducido, y si se añade la cifra de las 346 h como segunda referencia.
- **Mejora posible, fuera de alcance:** un relieve de 2–5 m del sitio (modelo de LROC NAC) resolvería la
  loma y el cráter. No está en `ops/data_manifest.json`, así que no se ha descargado nada.
- **Fuentes nuevas** anotadas en `SOURCES.md`: página de LROC del módulo y entrada del nomenclátor de
  Mons Latreille.
