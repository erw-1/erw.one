## Minification for dist

### JS
```shell
npx esbuild app.js --bundle --minify --format=esm --target=es2020 --outfile=km.min.js --legal-comments=none '--external:http*' '--external:https*'
```

### CSS
```shell
npx esbuild styles.css --bundle --minify --outfile=km.min.css
```
