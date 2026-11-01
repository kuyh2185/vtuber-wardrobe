# 주름 치마: 직사각 천을 허리에 모아 속치마 틀 위로 떨어뜨린다.
import os, random
exec(open(os.path.expanduser('~/vtuber-wardrobe/blender/common.py'), encoding='utf-8').read())

CY = -0.012        # 몸 중심 y
RY = 0.82          # 앞뒤 납작한 정도
WAIST_Z = 1.085
WAIST_R = 0.088    # 허리 반지름(x 기준), 틀의 첫 값


def petti(name='Petti', profile=None):
    """속치마 틀: 허리에서 엉덩이까지 붙었다가 아래서 둥글게 벌어짐"""
    p = profile or [(.085, 1.10), (.092, WAIST_Z), (.112, 1.05), (.14, 1.01), (.172, .965),
                    (.2, .92), (.222, .87), (.238, .82), (.246, .77), (.246, .70)]
    o = lathe(name, p, 64, 'Sim')
    for v in o.data.vertices:
        # 허리는 몸이 앞쪽에 있어 틀 중심도 같이 앞으로
        t = min(max((v.co.z - .95) / .12, 0), 1)
        v.co.y = v.co.y * RY + CY - .032 * t * t * (3 - 2 * t)
    o.data.update()
    o.modifiers.new('col', 'COLLISION')
    o.collision.thickness_outer = .004
    o.collision.cloth_friction = 8
    o.hide_render = True
    return o


def skirt(name, width=1.35, hem=2.5, length=.37, rows=26, cols=160, pleats=22, top_z=WAIST_Z, top_r=None,
          amp=.007, frames=70, seed=3, bend=1.2, mass=.18, colliders=None):
    """width: 윗줄 천 폭, hem: 밑단 천 폭, length: 천 길이(m). 윗줄을 허리에 고정해 모은다."""
    random.seed(seed)
    R0, R1 = width / (2 * math.pi), hem / (2 * math.pi)
    dz = math.sqrt(max(length ** 2 - (R1 - R0) ** 2, .01))
    # 주름 간격을 조금씩 다르게
    phase = []
    t, step = 0.0, []
    for i in range(pleats):
        step.append(random.uniform(.75, 1.25))
    s = sum(step)
    edges = [0]
    for w in step:
        edges.append(edges[-1] + w / s)

    def pleat(u):
        for i in range(pleats):
            if u <= edges[i + 1]:
                return math.sin(2 * math.pi * (u - edges[i]) / (edges[i + 1] - edges[i]))
        return 0

    rows_co = []
    for i in range(rows):
        q = i / (rows - 1)
        R, d = R0 + (R1 - R0) * q, dz * q
        row = []
        for j in range(cols):
            u = j / cols
            a = 2 * math.pi * u
            r = R + .004 * pleat(u)
            row.append((r * math.cos(a), r * RY * math.sin(a) + CY, top_z - d))
        rows_co.append(row)
    o = grid_mesh(name, rows_co, True)
    me = o.data
    # 윗줄을 허리로 모으는 셰이프 키
    o.shape_key_add(name='Basis')
    k = o.shape_key_add(name='gather')
    for j in range(cols):
        u = j / cols
        a = 2 * math.pi * u
        if top_r:      # 몸 둘레를 길이로 나눠 등 쪽에 천이 몰리지 않게
            x, y, nx, ny = top_r(u)
            p = amp * pleat(u)
            k.data[j].co = (x + nx * p, y + ny * p, top_z)
        else:
            r = WAIST_R + amp * pleat(u)
            k.data[j].co = (r * math.cos(a), r * RY * math.sin(a) + CY, top_z)
    k.value = 0
    k.keyframe_insert('value', frame=1)
    k.value = 1
    k.keyframe_insert('value', frame=24)
    group(o, 'pin', {j: 1.0 for j in range(cols)})
    group(o, 'pin', {j + cols: .8 for j in range(cols)})
    m = o.modifiers.new('cloth', 'CLOTH')
    s = m.settings
    s.vertex_group_mass = 'pin'
    s.pin_stiffness = 1
    s.quality = 7
    s.mass = mass
    s.air_damping = 2
    s.tension_stiffness = 12
    s.compression_stiffness = 2
    s.shear_stiffness = 4
    s.bending_stiffness = bend
    c = m.collision_settings
    c.collision_quality = 3
    c.distance_min = .004
    c.friction = 4
    c.use_self_collision = True
    c.self_distance_min = .003
    return simulate(o, frames)


if __name__ == '__main__':
    remove('Skirt')
    petti()
    skirt('Skirt')
