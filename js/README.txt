CUTTING MASTER - GLASS UPDATE

Files:
- index.html: separate Aluminium Bar / Glass input modes; settings no longer contain bar length or glass dimensions.
- js/app.js: updated UI logic, separate calculations, glass result rendering, long-press D-pad acceleration, quote escaping fix.
- js/glass-optimizer.js: 2D glass sheet nesting optimizer with 90-degree rotation.
- style.css: glass layout and input styles.

IMPORTANT:
Keep your existing js/optimizer.js. The updated app.js still imports it for the Aluminium Bar optimizer.

Replace these files in your repository:
index.html
style.css
js/app.js
Add:
js/glass-optimizer.js

No changes are required to js/optimizer.js.
