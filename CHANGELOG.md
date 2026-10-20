# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0-a1] - 2026-10-09

### Added

- Ability to read MCD files from remote URL using HTTP ranges

### Fixed

- dependencies from `dependabot`

## [0.2.0-a1] - 2026-07-07

### Changed

- Implement byte source chunking for large MCD files without using contiguous array buffers
- Add parameter to return raw PNG binary sequence for slide, panorama, and ablation images

## [0.1.4-a1] - 2026-06-29

### Fixed

- Expose `NDArray` interface for API and docs
- Edit typedoc for `TXTFile.readAcquisition` `options.strict`

### Added

- Basic `node` example in `examples`: Create an RGB gallery from a single MCD acquisition


## [0.1.3-a1] - 2026-06-17

### Fixed

- Proper data offsets applied for slide, panorama, and ablation images to read into bitmap or decode from PNG array

## [0.1.2-a1] - 2026-06-10

### Fixed

- Proper dimensions output for flattened TXT file `NDArray` if `X` and `Y` coordinate columns are missing


## [0.1.1-a1] - 2026-06-05

### Added

- Array of acquisitions IDs available through `MCDFile.acquisitionIDs`


## [0.1.0-a1] - 2026-06-03

- Initial dev implementation, focus on reading raw acuisitions as float32 arrays

