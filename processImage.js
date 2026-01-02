import * as BABYLON from '@babylonjs/core';

 function processImage(input, scene) {
    // Accept either an ImageData or an HTMLImageElement as `input`.
    const TEX_SIZE = 512;
    
console.log("image",input)

    // Prepare a temporary canvas sized to the texture where we'll draw/scale the source.
    const tmp = document.createElement('canvas');

    if (input && input.data && typeof input.data.length === 'number') {
       tmp.width = input.width;
       tmp.height = input.height;
    } else if (input && (input instanceof HTMLImageElement || input.tagName === 'IMG'))  {
        tmp.width = input.width;
        tmp.height = input.height;
    } else {
        tmp.width = TEX_SIZE;
        tmp.height = TEX_SIZE
    }
   const tmpCtx = tmp.getContext('2d');
    const dynamicTexture = new BABYLON.DynamicTexture("dynamicTexture", { width: tmp.width, height: tmp.height }, scene, false);
    dynamicTexture.hasAlpha = true;
    const dtCtx = dynamicTexture.getContext();
    dtCtx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
    // If input is ImageData, draw it to an intermediate canvas first so we can scale it.
    if (input && input.data && typeof input.data.length === 'number') {
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = input.width;
        srcCanvas.height = input.height;
        const srcCtx = srcCanvas.getContext('2d');
        srcCtx.putImageData(input, 0, 0);
        // draw scaled into tmp
        tmpCtx.drawImage(srcCanvas, 0, 0, tmp.width, tmp.height);
    } else if (input && (input instanceof HTMLImageElement || (input.tagName && input.tagName === 'IMG'))) {
        
        tmpCtx.drawImage(input, 0, 0, tmp.width, tmp.height);
        dtCtx.drawImage(input, 0, 0, tmp.width, tmp.height);
    } else {
       // throw new Error('Unsupported input to processImage — expected ImageData or HTMLImageElement');
        return [null,null]
    }

    // Read pixel data from the tmp canvas, process it, and write into the dynamic texture.
    const imageData = tmpCtx.getImageData(0, 0, tmp.width, tmp.height);
    // Put processed pixels into the dynamic texture's context and update the texture.
    //dtCtx.putImageData(imageData, 0, 0);
    dynamicTexture.update(false);

    return [dynamicTexture, imageData];
};

export async function heightMapfromImageData(image, scene, texture, newWidth=40, newHeight=40, maxDepth = 1.0) {
    let newHeightMapTexture = null;
    let imageData = null;

    [newHeightMapTexture, imageData] = processImage(image, scene);
    
    if (!imageData) {
        return null
    }
    const width = imageData.width;
    const height = imageData.height;
    const heights = new Array(width * height);

   
    //calculate heights from grayscale image data
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            const r = imageData.data[index];
            const g = imageData.data[index + 1];
            const b = imageData.data[index + 2];
            // Convert RGB to grayscale height
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;

            heights[y * width + x] =  gray * 0.10; // Scale height
        
        }
    }
   // console.log("heights computed");

    
    // Resize heights to a manageable grid size 
    const mapWidth = Math.floor(width/10); //newWidth;
    const mapHeight = Math.floor(height/10); //newHeight;
    const resizedHeights = new Array(mapWidth * mapHeight);
   // console.log("Resizing height map to:", mapWidth, "x", mapHeight);
    for (let j = 0; j < mapHeight; j++) {
        for (let i = 0; i < mapWidth; i++) {
            const srcX = Math.floor(i * (width / mapWidth));
            const srcY = Math.floor(j * (height / mapHeight));
            resizedHeights[j * mapWidth + i] = heights[srcY * width + srcX];
        }
    }

    // Normalize heights to fit within maxDepth
    let mxH = 0;
    let minH = 20;

for (let i = 0; i < mapHeight; i++) {
    for (let j = 0; j < mapWidth; j++) {
        mxH = Math.max(mxH, resizedHeights[i * mapWidth + j]);
        minH = Math.min(minH, resizedHeights[i * mapWidth + j]);
    }
};
//console.log("Max height:", mxH, "Min height:", minH);
const scaleHeight = maxDepth / (mxH - minH);
for (let i = 0; i < mapHeight; i++) {
    for (let j = 0; j < mapWidth; j++) {
        resizedHeights[i * mapWidth + j] = (resizedHeights[i * mapWidth + j] - minH) * scaleHeight;
    }
}
    // Convert height array to 3D positions (x, y, z)
    // Center the mesh around the origin and scale so it fits the camera view.
    const positions = [];
    const XY_SCALE = 0.2;      // spacing for x/z so the mesh spans ~4 units
    const HEIGHT_SCALE = 1;// 0.08; // scale factor for height values so they're visible
    const cx = (mapWidth - 1) / 2;
    const cz = (mapHeight - 1) / 2;
    for (let j = 0; j < mapHeight; j++) {
        for (let i = 0; i < mapWidth; i++) {
            const xPos = (i - cx) * XY_SCALE;
            const yPos = resizedHeights[j * mapWidth + i] * HEIGHT_SCALE;
            const zPos = (j - cz) * XY_SCALE;
            positions.push(xPos, yPos, zPos);
        }
    }
 
    // Make indices array
    const indices = [];
    for (let j = 0; j < mapHeight - 1; j++) {
        for (let i = 0; i < mapWidth - 1; i++) {
            const a = j * mapWidth + i;
            const b = j * mapWidth + (i + 1);
            const c = (j + 1) * mapWidth + i;
            const d = (j + 1) * mapWidth + (i + 1);
            indices.push(a, b, c, c, b, d);
        }
    }
    //console.log("Generated height map with size:", mapWidth, "x", mapHeight);
    //console.log("Generated indices count:", indices.length);
    //console.log("Generated positions count:", positions.length);

    // Build normalized UVs (0..1) matching the grid coordinates
    const uvs = [];
    for (let j = 0; j < mapHeight; j++) {
        for (let i = 0; i < mapWidth; i++) {
            const u = mapWidth > 1 ? i / (mapWidth - 1) : 0;
            const v = mapHeight > 1 ? j / (mapHeight - 1) : 0;
            uvs.push(u, v);
        }
    }

    const customMesh = new BABYLON.Mesh("heightMesh", scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.uvs = uvs;

    // Compute normals for lighting and assign before applying
    const normals = [];
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);
    vertexData.normals = normals;

    // Apply vertex data to mesh
    vertexData.applyToMesh(customMesh);
    //console.log("applied to mesh")

    // Optionally convert to flat shaded mesh (after data applied)
    customMesh.convertToFlatShadedMesh();
    const pbr = new BABYLON.PBRMetallicRoughnessMaterial("pbr", scene);
   
    // If a texture was provided (e.g., a DynamicTexture), apply it
    if (newHeightMapTexture) {
        pbr.baseColor = new BABYLON.Color3(1.0, 1.0, 1.0);
        pbr.baseTexture = newHeightMapTexture;
        pbr.metallic = 0.2;
        pbr.roughness = 0.8;
        pbr.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
        pbr.alpha = 0.8;
        pbr.backFaceCulling = false;
        customMesh.material = pbr;
    }
    
//    console.log("Height map mesh created from uploaded image");
//    console.log(" size:", mapWidth, "x", mapHeight);
//    console.log(" vertices ", positions.length);
    customMesh.position = new BABYLON.Vector3(0, 0,-2);
    customMesh.rotation = new BABYLON.Vector3(0, 0, 0);
    return customMesh
}
