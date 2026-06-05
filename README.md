# imcjs

Pure client side parser for Imaging Mass Cytometry MCD and TXT files. 

Mimics the Python API provided by [readimc](https://github.com/BodenmillerGroup/readimc). 

`imcjs` depends only on browser-compatible XML-parsing libraries. 

## Quickstart

Install: `npm install`

Testing: `npm run test`

Build: `npm run build`

### Usage

```
const buffer = fs.readFileSync("path_to_mcd");
const file = new File([buffer], "mcdMCD.mcd", {type: "text/plain"}); 
const mcd = await MCDFile.fromFile(file);

# Read the first acquisition, and view the array data and shape (C, H, W)
const acqRead = mcd.readAcquisition(mcd.slides[0].acquisitions[0]);
console.log(acqRead.data, acqRead.shape);
```

## Development

Minimum version recommended: 

- Node: v20+
- npm: v11+
- tsc: v7+