import { useFrame, Canvas } from '@react-three/fiber';
import type { WorldActivity } from '../worldLayout';
import { PALETTE } from './palette';
import { DESK_SIZE, DOOR_X_RANGE, OBSTACLES, ROOM_DEPTH, ROOM_WIDTH, SERVER_CABINET_SIZE, STATION, WALL_HEIGHT } from './cryptoLabLayout';
import { usePilotRoomMovement } from './usePilotRoomMovement';

const WALL_THICKNESS = 0.2;

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
      <meshStandardMaterial color={PALETTE.floorCeramic} />
    </mesh>
  );
}

/** Four walls with a gap for the door in the south wall (+Z). */
function Walls() {
  const half = WALL_HEIGHT / 2;
  const doorWidth = DOOR_X_RANGE[1] - DOOR_X_RANGE[0];
  const southSegment = (ROOM_WIDTH - doorWidth) / 2;
  return (
    <group>
      {/* North wall */}
      <mesh position={[0, half, -ROOM_DEPTH / 2]}>
        <boxGeometry args={[ROOM_WIDTH, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={PALETTE.wallPaint} />
      </mesh>
      {/* East wall */}
      <mesh position={[ROOM_WIDTH / 2, half, 0]}>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, ROOM_DEPTH]} />
        <meshStandardMaterial color={PALETTE.wallPaint} />
      </mesh>
      {/* West wall */}
      <mesh position={[-ROOM_WIDTH / 2, half, 0]}>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, ROOM_DEPTH]} />
        <meshStandardMaterial color={PALETTE.wallPaint} />
      </mesh>
      {/* South wall, split either side of the door opening */}
      <mesh position={[-(ROOM_WIDTH - southSegment) / 2, half, ROOM_DEPTH / 2]}>
        <boxGeometry args={[southSegment, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={PALETTE.wallPaint} />
      </mesh>
      <mesh position={[(ROOM_WIDTH - southSegment) / 2, half, ROOM_DEPTH / 2]}>
        <boxGeometry args={[southSegment, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={PALETTE.wallPaint} />
      </mesh>
    </group>
  );
}

function Desk() {
  return (
    <mesh position={[STATION.x, DESK_SIZE.height / 2, STATION.z]}>
      <boxGeometry args={[DESK_SIZE.width, DESK_SIZE.height, DESK_SIZE.depth]} />
      <meshStandardMaterial color={PALETTE.oakBase} />
    </mesh>
  );
}

function ServerCabinet() {
  const box = OBSTACLES[1];
  const x = (box.minX + box.maxX) / 2;
  const z = (box.minZ + box.maxZ) / 2;
  return (
    <mesh position={[x, SERVER_CABINET_SIZE.height / 2, z]}>
      <boxGeometry args={[SERVER_CABINET_SIZE.width, SERVER_CABINET_SIZE.height, SERVER_CABINET_SIZE.depth]} />
      <meshStandardMaterial color={PALETTE.equipmentCharcoal} />
    </mesh>
  );
}

function Player({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, 0.9, z]}>
      <capsuleGeometry args={[0.35, 1.1, 4, 8]} />
      <meshStandardMaterial color={PALETTE.ledCyan} />
    </mesh>
  );
}

/** Classic 3/4 isometric offset from the point the camera is tracking. */
const CAMERA_OFFSET = { x: 9, y: 9, z: 9 };

function CameraRig({ x, z }: { x: number; z: number }) {
  useFrame(({ camera }) => {
    camera.position.set(x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, z + CAMERA_OFFSET.z);
    camera.lookAt(x, 0.8, z);
  });
  return null;
}

function Scene({ onInteract, onEscape }: { onInteract: () => void; onEscape: () => void }) {
  const { position } = usePilotRoomMovement(onInteract, onEscape);
  return (
    <>
      <color attach="background" args={[PALETTE.blackPolymer]} />
      <CameraRig x={position.x} z={position.z} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 8, 4]} intensity={0.8} />
      <Floor />
      <Walls />
      <Desk />
      <ServerCabinet />
      <Player x={position.x} z={position.z} />
    </>
  );
}

/** Pilot 3D room for the Cryptography Lab, reached from the 2D campus map.
 * Placeholder box/plane geometry colored from the blender/palette.py values;
 * real Blender-exported props swap in later without restructuring the scene. */
export function CryptoLabScene({ onExit, onOpen }: { onExit: () => void; onOpen: (activity: WorldActivity) => void }) {
  return (
    <div className="absolute inset-0 bg-black">
      <Canvas orthographic camera={{ position: [10, 10, 10], zoom: 55, near: 0.1, far: 100 }}>
        <Scene onInteract={() => onOpen('rooms')} onEscape={onExit} />
      </Canvas>
      <button className="world-open absolute top-4 right-4" onClick={onExit}>
        Exit (Esc)
      </button>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center text-white">
        WASD to move · E to decode a message near the desk
      </div>
    </div>
  );
}

export default CryptoLabScene;
