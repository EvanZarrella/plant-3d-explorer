
import * as THREE from 'three'
import OrbitControls from 'common/thiers/OrbitController'

import Mesh from './entities/mesh'
import PointCloud from './entities/pointCloud'
import Skeleton from './entities/skeleton'

const clock = new THREE.Clock()

function addShadowedLight (scene, x, y, z, color, intensity) {
  const directionalLight = new THREE.DirectionalLight(color, intensity)
  directionalLight.position.set(x, y, z)
  scene.add(directionalLight)

  directionalLight.castShadow = true

  const d = 1
  directionalLight.shadow.camera.left = -d
  directionalLight.shadow.camera.right = d
  directionalLight.shadow.camera.top = d
  directionalLight.shadow.camera.bottom = -d

  directionalLight.shadow.camera.near = 1
  directionalLight.shadow.camera.far = 40000

  directionalLight.shadow.mapSize.width = 1024
  directionalLight.shadow.mapSize.height = 1024

  directionalLight.shadow.bias = -0.001
}

export default class World {
  constructor (width, height, elem) {
    this.width = width
    this.height = height
    this.elem = elem
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xe8e8e8)

    this.scene.add(new THREE.HemisphereLight(0x443333, 0x111122))
    addShadowedLight(this.scene, 1, 1, 1, 0xffffff, 1.35)
    addShadowedLight(this.scene, 0.5, 1, -1, 0xffaa00, 1)

    this.cameraGroup = new THREE.Object3D()
    this.viewerObjects = new THREE.Object3D()
    this.scene.add(this.viewerObjects)
    window.viewerObjects = this.viewerObjects

    this.perspectiveCamera = new THREE.PerspectiveCamera(35, this.width / this.height, 1, 5000)
    this.perspectiveCamera.position.set(1000, 100, 0)
    this.camera = this.perspectiveCamera

    this.controls = new OrbitControls(this.perspectiveCamera, this.elem)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.30
    this.controls.rotateSpeed = 0.2
    this.controls.zoomSpeed = 0.2
    this.controls.panSpeed = 0.2
    this.controls.screenSpacePanning = false
    this.controls.minDistance = 5
    this.controls.maxDistance = 8000
    this.controls.screenSpacePanning = true

    // Y-upifying needs to be after the creation of the controller instance
    this.camera.up.set(0, 0, -1)
    this.camera.rotation.order = 'YXZ'

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(width, height)
    this.renderer.shadowMap.enabled = true
    this.elem.appendChild(this.renderer.domElement)

    this.viewerObjects.add(this.cameraGroup)

    const animate = () => {
      this.render()
      window.requestAnimationFrame(animate)
    }
    animate()
  }

  computeDynamicFOV (cameraModel, dist) {
    const height = ((cameraModel.params[3] * 2) * dist) / cameraModel.params[0]
    return 2 * Math.atan(height / (2 * dist)) * (180 / Math.PI)
  }

  setSize (width, height) {
    this.width = width
    this.height = height
    this.renderer.setSize(width, height)
    this.renderer.render(this.scene, this.controls.object)
  }

  setWorkSpaceBox (workspace) {
    if (this.viewportBox) this.viewerObjects.remove(this.viewportBox)

    const geometry = new THREE.BoxGeometry(
      (workspace.x[1] - workspace.x[0]),
      (workspace.y[1] - workspace.y[0]),
      (workspace.z[1] - workspace.z[0])
    )
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true })
    const box = new THREE.Mesh(geometry, material)

    box.position.x = (workspace.x[1] + workspace.x[0]) / 2
    box.position.y = (workspace.y[1] + workspace.y[0]) / 2
    box.position.z = (workspace.z[1] + workspace.z[0]) / 2
    this.viewportBox = box
    this.viewerObjects.add(this.viewportBox)
  }

  setMetaData (metadata) {
    const workspace = metadata.workspace
    this.metadata = metadata
    this.setWorkSpaceBox(workspace)

    this.viewerObjects.position.x = -(workspace.x[1] - workspace.x[0])
    this.viewerObjects.position.y = -(workspace.y[1] - workspace.y[0])
    this.viewerObjects.position.z = -(workspace.z[1] - workspace.z[0]) / 2
  }

  setCameraPoints (points) {
    const material = new THREE.MeshPhongMaterial({ color: 0x333333, wireframe: true, transparent: true, opacity: 0.1 })
    this.CameraPointsGroup = new THREE.Object3D()

    points.forEach(({ v3position, objM4rotation }) => {
      const cameraGroup = new THREE.Object3D()
      const coneGeeometry = new THREE.ConeGeometry(10, 25, 4)
      const cone = new THREE.Mesh(coneGeeometry, material)

      cameraGroup.position.copy(v3position)
      cameraGroup.rotation.setFromRotationMatrix(objM4rotation)
      cameraGroup.add(cone)

      this.CameraPointsGroup.add(cameraGroup)
    })

    this.cameraGroup.add(this.CameraPointsGroup)
  }

  setSelectedCamera (camera) {
    if (this.imgMesh) this.scene.remove(this.imgMesh)

    if (camera) {
      const cameraModel = this.metadata.camera_model
      const imgDistance = 2000
      const fov = this.computeDynamicFOV(cameraModel, imgDistance)
      this.camera = new THREE.PerspectiveCamera(fov, this.width / this.height, 0.1, 5000)

      this.camera.position
        .copy(camera.v3position)
        .applyMatrix4(this.viewerObjects.matrix)

      this.camera.rotation.setFromRotationMatrix(
        new THREE.Matrix4()
          .copy(camera.vueM4rotation)
          .multiply(this.viewerObjects.matrix)
      )

      var distance = imgDistance
      var aspect = cameraModel.params[2] / cameraModel.params[3]
      var vFov = this.camera.fov * Math.PI / 180

      var imgHeight = 2 * Math.tan(vFov / 2) * distance
      var imgWidth = imgHeight * aspect
      const imgPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(imgWidth, imgHeight),
        new THREE.MeshBasicMaterial({ map: camera.texture, side: THREE.DoubleSide })
      )

      var startPos = new THREE.Vector3().copy(this.camera.position)
      var direction = this.camera.getWorldDirection()
      startPos.add(direction.multiplyScalar(imgDistance))

      imgPlane.position.copy(startPos)
      imgPlane.rotation.copy(this.camera.rotation)

      this.scene.add(imgPlane)
      this.imgMesh = imgPlane
    } else {
      this.camera = this.perspectiveCamera
    }
  }

  setMeshGeometry (geometry) {
    this.mesh = new Mesh(geometry, this.viewerObjects)
  }

  setPointcloudGeometry (geometry) {
    geometry.computeBoundingBox()
    this.pointCloud = new PointCloud(geometry, this.viewerObjects)
  }

  setSkeletonPoints (skeleton) {
    this.skeleton = new Skeleton(skeleton, this.viewerObjects)
  }

  setLayers (layers) {
    if (this.mesh) this.mesh.setVisible(layers.mesh)
    if (this.pointCloud) this.pointCloud.setVisible(layers.pointCloud)
    if (this.skeleton) this.skeleton.setVisible(layers.skeleton)
  }

  render () {
    clock.getDelta()
    this.controls.update(clock.getDelta())
    this.renderer.render(this.scene, this.camera)
  }
}
