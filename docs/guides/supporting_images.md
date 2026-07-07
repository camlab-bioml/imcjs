# Slides, Panoramas, and Ablation images

In addition to reading acquisitions into raw signal arrays, `imcjs` can also read in whole slide, panorama, and pre and post-ablation images. These supportive images proide RGB-compatible images with information on broad tissue morphology before and after the acquisition process. 

## Formatting

Slides, panoramas, and ablation images are RGB images, differing from the raw aquisition signal which ineeds to be rasterized into RGB. Each type of image has a parser function starting with `read` (i.e. `readSlide`), which can return a binary PNG Uint8Array if `return_raw` is set to `true`, or is run using Node. If run in the browser, and `return_raw` is set to `false`, then the user can also return the image as an image bitmap. 

## Slides

Slide images provide an RGB image summary of the physical slide parameters used when acquiring one or more acquisitions:

```
const slides = await mcd.getSlides()
const slideRead = await mcd.readSlide(slides[0])
```

Typically, there is one slide stored per MCD file, but the file format does make it possible to store multiple slides. 

## Panoramas

Panorama images are similar to slide images, but they provide a greyscale version of the tissue morphology on the slide. They are acquired by the instrument. These images are optional; the mcd file can contain zero or multiple panorama images. 

```
const pano = await mcd.readPanorama(slides[0].panoramas[0])
```

## Pre and post-ablation images

These images are greyscale optical image captures of an acquisition before and after processing through the instrument. They are stored on a per acquisition basis, and are optional; mcd files can contain zero or multiple ablation images. 

```
const beforeAblation = await mcd.readBeforeAblationImage(slides[0].acquisitions[0]);
const afterAblation = await mcd.readAfterAblationImage(slides[0].acquisitions[0]);
```

For more information on reading these types of supporting images, visit [this resource](https://bodenmillergroup.github.io/readimc/usage.html). 
