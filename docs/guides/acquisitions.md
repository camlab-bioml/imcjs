# Reading acquisition data

Acquisitions contain the metadata and raw channel imaging data for a single regions of interest (ROI)/field of view (FOV) for multiple channels. 

## Reading acquisitions from MCD

From MCD files, acquisitions can be read from slides:

```
const slides = await mcd.getSlides();
const acqRead = await mcd.readAcquisition(slides[0].acquisitions[0]);
console.log(acqRead.data, acqRead.shape);
```

Acquisitions promises return `NDArray` objects, with {data: [], shape: []}. The `.data` property contains the raw imaging values as `UFloat32Array` objects, and `.shape` provides an array of the dimensions of the acquisition/ROI as `[numChannels, height, width]`. 

Acquisitions ead into row major order in the order that the channel arrays appear in the raw MCD. Arrays can be sliced into channel-specific arrays as follows:

```
const labels = slides[0].acquisitions[0].channelLabels
const indexChannel = slides[0].acquisitions[0].channelLabels.indexOf(channel);
    let chanArray = acq.data.slice((indexChannel * acq.shape[2] * acq.shape[1]), ((indexChannel + 1) * acq.shape[2] * acq.shape[1]));
```

Acquisition array dimensions can easily be converted into RGB rasterized versions:

```
function recolourUint8ToRGB(data, width, height, r, g, b, opts = {}) {
  const { gamma = 1, minVal, maxVal } = opts;
  const pixels = width * height;

  let lo = minVal ?? Infinity, hi = maxVal ?? -Infinity;
  if (minVal === undefined || maxVal === undefined) {
    for (let i = 0; i < pixels; i++) {
      if (data[i] < lo) lo = data[i];
      if (data[i] > hi) hi = data[i];
    }
  }

  const range = hi - lo || 1;
  const output = new Uint8ClampedArray(pixels * 4);

  for (let i = 0; i < pixels; i++) {
    const t = (data[i] - lo) / range;
    const intensity = gamma === 1 ? t : Math.pow(t, gamma);
    const j = i * 4;
    output[j]     = Math.round(r * intensity);
    output[j + 1] = Math.round(g * intensity);
    output[j + 2] = Math.round(b * intensity);
    output[j + 3] = 255;
  }

  return output;
}

let rgbArray = recolourUint8ToRGB(scaledChannel, acq.shape[2], acq.shape[1], 0, 255, 255)
```

And row-major order allows easy PNG rendering using `canvas`:

```
import { createCanvas } from "canvas";

const srcCanvas = createCanvas(acq.shape[2], acq.shape[1]);
const srcCtx = srcCanvas.getContext("2d");

const imageData = srcCtx.createImageData(acq.shape[2], acq.shape[1]);

imageData.data.set(rgbArray);
srcCtx.putImageData(imageData, 0, 0);
```

## Reading large acquisitions & slicing

The browser requires `4 * numChannels * width * height` bytes to store entire acquisitions in single `UFloat32Array` objects. When the size requested gets larger than 3-4GB, the browser will likely throw an error that the entire acquisition cannot be read in a single array. 

To bypass this, users can slice into the array to read channel-specific arrays by passing options such as `{channels: []}` to `readAcquisition`:

```
const labels = slides[0].acquisitions[0].channelLabels
for (let i = 0; i < labels.length; i++) {
    let acqSingleChannel = await mcd.readAcquisition(slides[0].acquisitions[0],
    {channels: [i]});
    console.log(acqSingleChannel.data);
    console.log(acqSingleChannel.shape);
    }
```

