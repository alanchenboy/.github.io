// WebGL Text - Textures
// from https://webglfundamentals.org/webgl/webgl-text-texture.html


"use strict";


var hb, fontBlob;
var testText = "ខណ្ឌពោធិ៍សែនជ័យ";

var svgCtr = document.createElement("canvas").getContext("2d");
var glyphs = []
var glyphsImages = {}

function makeSVGCanvas(img) {
  svgCtr.canvas.width  = img.width;
  svgCtr.canvas.height = img.height;
  svgCtr.clearRect(0, 0, svgCtr.canvas.width, svgCtr.canvas.height);
  svgCtr.drawImage(img, 0, 0);

  return svgCtr.canvas;
}

// We could use instantiateStreaming but it's not supported in Safari yet
// https://bugs.webkit.org/show_bug.cgi?id=173105
fetch("hb.wasm").then(function (x) {
  return x.arrayBuffer();
}).then(function (wasm) {
  return WebAssembly.instantiate(wasm);
}).then(function (result) {
  result.instance.exports.memory.grow(400); // each page is 64kb in size
  window.hb = hbjs(result.instance);
  fetch('Noto Sans Medium Khmer.ttf').then(function (res) {
    return res.arrayBuffer();
  }).then(function (blob) { // can be used without our wrapper
    window.fontBlob = new Uint8Array(blob);
    console.log("Font blob loaded.")
    CreateHBGlyphs();
  });
});

function CreateHBGlyphs() {
  var blob = hb.createBlob(fontBlob);
  var face = hb.createFace(blob, 0);
  var font = hb.createFont(face);
  font.setScale(1200, 1200); // Optional, if not given will be in font upem
  let scale = 0.02;
  
  var buffer = hb.createBuffer();
  buffer.addText(testText);
  buffer.guessSegmentProperties();
  // buffer.setDirection('ltr'); // optional as can be by guessSegmentProperties also
  hb.shape(font, buffer); // features are not supported yet
  var result = buffer.json(font);

  // make glyph arry for render
  result.forEach(function (x) {
    var glyph = {};
    glyph.glyphIndex = x.g;
    glyph.xAdvance = x.ax;
    glyph.xDisplacement = x.dx;
    glyph.yDisplacement = x.dy;
   
    var image = glyphsImages[glyph.glyphIndex];
    if (image == null) {
      var svgImg = new Image();
      image = {};
      image.scale = scale
      var glyphJson = font.glyphToJson(glyph.glyphIndex);
      var svgData = getGlyphPath(x, glyphJson, image);

      glyphsImages[glyph.glyphIndex] = image;
      image.img = svgImg;
      image.loaded = false;
      svgImg.onload = function () {
        image.loaded = true;
        var allLoaded = true;
        for (var key in glyphsImages) {
          var x = glyphsImages[key];
          if (!x.loaded) {
            allLoaded = false;
          }
        }
        if (allLoaded) {
          console.log("all glyph image loaded");
          main();
        }
      }
      svgImg.src = "data:image/svg+xml;base64," + window.btoa(unescape(encodeURIComponent(svgData)));
    }

    glyphs.push(glyph);

    glyph.img = image;
    glyph.xAdvance *= scale;
    glyph.xDisplacement *= scale;
    glyph.yDisplacement *= scale;

    glyph.xDisplacement += image.x;
    glyph.yDisplacement -= image.y;
    
  });

  buffer.destroy();
  font.destroy();
  face.destroy();
  blob.destroy();
}

function getGlyphPath(glyphInfo, glyphJson, image) {
  var xmin = 10000;
  var xmax = -10000;
  var ymin = 10000;
  var ymax = -10000;

  var glyphPath = glyphJson.filter(function (command1) {
      return command1.type !== 'Z';
  }).map(function (command1) {
      var glyphPath = command1.values.map(function (p, i) {
      return i % 2 ? -p : p;
      }).map(function (x, i) {
      // bbox calc
      if (i % 2) {
          if (x < ymin) ymin = x;
          if (x > ymax) ymax = x;
      } else {
          if (x < xmin) xmin = x;
          if (x > xmax) xmax = x;
      }
      return x;
      });
      return [command1.type].concat(glyphPath);
  });
  var path = pathToRelative([glyphPath].reduce((acc, val) => acc.concat(val), [])).map(x => x[0] + x.slice(1).join(' '))

  var width = xmax - xmin;
  var height = ymax - ymin;
  // pad it a bit
  var pad = Math.round(Math.min(width / 10, height / 10));
  xmin -= pad;
  ymin -= pad;
  width += pad * 2;
  height += pad * 2;
  var bbox = xmin + ' ' + ymin + ' ' + width + ' ' + height;

  var s_height = height * image.scale;
  image.x = xmin * image.scale;
  image.y = (ymin + height) * image.scale;

  return '<svg xmlns="http://www.w3.org/2000/svg" height="' + s_height +  '" viewBox="' + bbox + '">' + '<path d="' + path + '" /></svg>';
}

function pathToRelative(pathArray) {
  if (!pathArray.length) return [];
  var x = pathArray[0][1], y = pathArray[0][2];
  var prevCmd = '';
  return [["M", x, y]].concat(pathArray.slice(1).map(function (pa) {
    var r = [prevCmd === pa[0] ? ' ' : pa[0].toLowerCase()].concat(pa.slice(1).map(function (z, i) {
      return z - ((i % 2) ? y : x);
    }));
    var lastPoint = r.slice(-2);
    x += lastPoint[0];
    y += lastPoint[1];
    prevCmd = pa[0];
    return r;
  }));
}

function main() {
  // Get A WebGL context
  /** @type {HTMLCanvasElement} */
  var canvas = document.querySelector("#canvas");
  var gl = canvas.getContext("webgl");
  if (!gl) {
    return;
  }

  // setup GLSL programs
  var textProgramInfo = webglUtils.createProgramInfo(gl, ["text-vertex-shader", "text-fragment-shader"]);

  for (var key in glyphsImages) {
    var image = glyphsImages[key];
    
    var textWidth = image.img.width;
    var textHeight = image.img.height;

    // Transform code
    // var svgCanvas = makeSVGCanvas(image.img);
    // let imageData = svgCtr.getImageData(0, 0, textWidth, textHeight);
    // // console.log(imageData.data);
    // for (var iy = 0; iy < imageData.width; ++iy) {
    //   for (var ix = 0; ix < imageData.height; ++ix) {

    //   }
    // }


    image.width = textWidth;
    image.height = textHeight;

    // Create a unit quad for the 'text'
    image.textBufferInfo = primitives.createPlaneBufferInfo(gl, textWidth, textHeight, 1, 1, m4.xRotation(Math.PI / 2));

    // create text texture.
    image.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, image.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image.img);

    // make sure we can render it even if it's not a power of 2
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  var fUniforms = {
    u_matrix: m4.identity(),
  };

  var textUnifom = {
    u_matrix: m4.identity(),
    u_texture: null,
  };

  function radToDeg(r) {
    return r * 180 / Math.PI;
  }

  function degToRad(d) {
    return d * Math.PI / 180;
  }

  var translation = [0, 30, 0];
  var rotation = [degToRad(190), degToRad(0), degToRad(0)];
  var scale = [1, 1, 1];
  var fieldOfViewRadians = degToRad(60);
  var rotationSpeed = 1.2;

  var then = 0;

  requestAnimationFrame(drawScene);

  // Draw the scene.
  function drawScene(now) {
    // Convert to seconds
    now *= 0.001;
    // Subtract the previous time from the current time
    var deltaTime = now - then;
    // Remember the current time for the next frame.
    then = now;

    webglUtils.resizeCanvasToDisplaySize(gl.canvas);

    // Tell WebGL how to convert from clip space to pixels
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Every frame increase the rotation a little.
    rotation[1] += rotationSpeed * deltaTime;

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.BLEND)
    gl.blendEquation( gl.FUNC_ADD );
    gl.blendFunc( gl.SRC_ALPHA, gl.SRC_ALPHA );
    gl.blendFunc( gl.DST_ALPHA, gl.ONE_MINUS_SRC_ALPHA );

    gl.clearColor(0.0, 1.0, 1.0, 1.0);

    // Clear the canvas AND the depth buffer.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Compute the matrices used for all objects
    var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    var projectionMatrix =
        m4.perspective(fieldOfViewRadians, aspect, 1, 2000);

    // Compute the camera's matrix using look at.
    var cameraRadius = 360;
    var cameraPosition = [Math.cos(now) * cameraRadius, 0, Math.sin(now) * cameraRadius];
    var target = [0, 0, 0];
    var up = [0, 1, 0];
    var cameraMatrix = m4.lookAt(cameraPosition, target, up);
    var viewMatrix = m4.inverse(cameraMatrix);

    // setup to draw the text.
    gl.useProgram(textProgramInfo.program);
    var x = 0;
    glyphs.forEach (function(glyph) {
      image = glyph.img;
      // translate to the image center
      var textMatrix = m4.translate(projectionMatrix,
        viewMatrix[12] + x + glyph.xDisplacement + image.width * 0.5, 
        viewMatrix[13] + glyph.yDisplacement + image.height * 0.5, viewMatrix[14]);

      webglUtils.setBuffersAndAttributes(gl, textProgramInfo, glyph.img.textBufferInfo);

      m4.copy(textMatrix, textUnifom.u_matrix);
      textUnifom.u_texture = glyph.img.texture;
      webglUtils.setUniforms(textProgramInfo, textUnifom);

      // Draw the text.
      gl.drawElements(gl.TRIANGLES, glyph.img.textBufferInfo.numElements, gl.UNSIGNED_SHORT, 0);

      x += glyph.xAdvance;
    });

    // Draw Next frame
    // requestAnimationFrame(drawScene);
  }
}
