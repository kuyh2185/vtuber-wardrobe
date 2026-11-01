# 비숍 소매: 긴 통을 어깨·손목에서 모으고 안에서 살짝 부풀려 주름을 만든다. 왼팔(+x)로 만들고 오른쪽은 거울.
import os, random
exec(open(os.path.expanduser('~/vtuber-wardrobe/blender/common.py'), encoding='utf-8').read())

ARM_A = Vector((.150, .002, 1.2615))   # 진동둘레 중심(어깨 끝)
ARM_B = Vector((.505, -.014, 1.262))   # 소매 끝(손목 조금 앞)
TILT = Vector((.10, 0, .995)).normalized()   # 진동둘레 면의 위쪽


def sleeve(name='SleeveL', rows=46, cols=84, folds=11, frames=70, seed=2, press=.010, ra=(.0425, .0445), rb=.034):
    """통 천 반지름이 어깨 5.2cm -> 손목 쪽 8cm로 넓어지는 재단, 양 끝을 모은다."""
    random.seed(seed)
    ax = (ARM_B - ARM_A).normalized()
    u = Vector((0, 0, 1)) - ax * ax.z
    u.normalize()
    v = ax.cross(u)
    L = (ARM_B - ARM_A).length * 1.1
    ph = [random.uniform(0, 6.28) for _ in range(3)]

    def rest(t):
        return .046 + .024 * min(t / .8, 1) ** 1.4

    def seed_fold(a, t):
        return .005 * math.sin(folds * a + ph[0] + 1.5 * math.sin(a + ph[1])) * (.3 + .7 * t)

    rows_co = []
    for i in range(rows):
        t = i / (rows - 1)
        c = ARM_A + ax * L * t
        ring = []
        for j in range(cols):
            a = 2 * math.pi * j / cols
            ring.append(tuple(c + (u * math.cos(a) + v * math.sin(a)) * (rest(t) + seed_fold(a, t))))
        rows_co.append(ring)
    o = grid_mesh(name, rows_co, True)
    o.shape_key_add(name='Basis')
    k = o.shape_key_add(name='gather')
    for j in range(cols):
        a = 2 * math.pi * j / cols
        n = .0015 * math.sin(14 * a)
        k.data[j].co = ARM_A + TILT * (ra[0] + n) * math.cos(a) + Vector((0, 1, 0)) * (ra[1] + n) * math.sin(a) * (1 if v.y > 0 else -1)
        n = .002 * math.sin(14 * a)
        k.data[(rows - 1) * cols + j].co = ARM_B + (u * math.cos(a) + v * math.sin(a)) * (rb + n)
    k.value = 0
    k.keyframe_insert('value', frame=1)
    k.value = 1
    k.keyframe_insert('value', frame=24)
    group(o, 'pin', {j: 1.0 for j in range(cols)} | {(rows - 1) * cols + j: 1.0 for j in range(cols)})
    m = o.modifiers.new('cloth', 'CLOTH')
    s = m.settings
    s.vertex_group_mass = 'pin'
    s.pin_stiffness = 1
    s.quality = 8
    s.mass = .05
    s.air_damping = 4
    s.tension_stiffness = 8
    s.compression_stiffness = .4
    s.shear_stiffness = 1
    s.bending_stiffness = .15
    s.effector_weights.gravity = .5
    s.use_pressure = True
    s.uniform_pressure_force = press
    c = m.collision_settings
    c.collision_quality = 3
    c.distance_min = .004
    c.use_self_collision = True
    c.self_distance_min = .002
    # 팔을 내렸을 때처럼 천이 손끝 쪽으로 쏠리게 중력을 팔 방향으로
    sc = bpy.context.scene
    g = sc.gravity.copy()
    sc.gravity = ax * 9.81
    try:
        return simulate(o, frames)
    finally:
        sc.gravity = g


def mirror(src, name):
    remove(name)
    me = src.data.copy()
    for v in me.vertices:
        v.co.x = -v.co.x
    me.flip_normals()
    o = bpy.data.objects.new(name, me)
    collection('Outfit').objects.link(o)
    return o
