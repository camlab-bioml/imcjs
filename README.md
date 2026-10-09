# imcjs

Parse Imaging Mass Cytometry (IMC) MCD and TXT files in the browser or with Node

Mimics the Python API provided by [readimc](https://github.com/BodenmillerGroup/readimc). 

`imcjs` depends only on basic, browser-compatible XML parsers. 

## Quickstart

Install: `npm install`

Testing: `npm run test`

Build: `npm run build`

## Basic Usage

### Node

```
import { MCDFile } from "imcjs";

const mcd = await MCDFile.fromPath(string_path_to_mcd);
```

### Browser File API
```
import { MCDFile } from "imcjs";


function handleFileUpload(e) {

    let filesUploaded = Array.from(e.target.files);
    const mcd = await MCDFile.fromFile(filesUploaded[0]);

}
```

### From remote URL

**NOTE**: this feature is experimental and not part of the original Python API. 

```
import { MCDFile } from "imcjs";

const mcd = await MCDFile.fromURL("https://borealisdata.ca/api/access/datafile/833251");
```

### Read an MCD acquisition
```
# Read the first acquisition, and view the array data and shape (C, H, W)

const slides = await mcd.getSlides();
const acqRead = await mcd.readAcquisition(slides[0].acquisitions[0]);
console.log(acqRead.data, acqRead.shape);
```

## Development

Minimum version recommended: 

- Node: v20+
- npm: v11+
- tsc: v7+