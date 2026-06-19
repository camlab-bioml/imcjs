# imcjs

parse Imaging Mass Cytometry (IMC) MCD and TXT files directly in the browser. 

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
import fs from "node:fs";

const buffer = fs.readFileSync("path_to_mcd");
const file = new File([buffer], "mcdMCD.mcd", {type: "text/plain"}); 
const mcd = await MCDFile.fromFile(file);
```

### Browser File API
```
import { MCDFile } from "imcjs";


function handleFileUpload(e) {

    let filesUploaded = Array.from(e.target.files);
    const mcd = await MCDFile.fromFile(filesUploaded[0]);

}
```

### Read an MCD acquisition
```
# Read the first acquisition, and view the array data and shape (C, H, W)
const acqRead = mcd.readAcquisition(mcd.slides[0].acquisitions[0]);
console.log(acqRead.data, acqRead.shape);
```

## Development

Minimum version recommended: 

- Node: v20+
- npm: v11+
- tsc: v7+