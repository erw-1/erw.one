# Source Files

`src/` contains the active CSS and JavaScript used directly by `index.html`.

There is no required package workflow for publishing. If you need generated output, use the optional scripts in `../scripts` from the project root:

```shell
python scripts/build_online-noSEO.py
python scripts/build-offline-onefile.py
```

Do not edit generated files in `build/`; regenerate them from `index.html` and `src/`.
