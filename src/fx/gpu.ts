// Which WebGL renderers draw on the CPU. Only names that are software for certain are listed, so any real
// GPU, however old, never matches and keeps the moving effects. On a match the effects draw one still frame.
const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|software (rasterizer|renderer)|basic render driver/i

/** Firefox gives the real name as RENDERER; Chrome and Safari mask it as "WebKit WebGL" and give it through the debug extension. */
export function rendererName(gl: WebGL2RenderingContext) {
  const plain = String(gl.getParameter(gl.RENDERER) ?? '')
  if (!/^webkit/i.test(plain)) return plain
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '') : plain
}

export const isSoftware = (renderer: string) => SOFTWARE.test(renderer)
