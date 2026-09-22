"""Four handmade plush fusions. Run Blender --background --python art/generate_fusions.py.
Original Sprout/Tumble/Morrow silhouettes and colors are combined as new toys.
Writes only the four fusion GLBs, portraits, and fusion preview/source blend.
"""
from pathlib import Path
shared = Path(__file__).with_name('generate_assets.py').read_text()
exec(compile(shared.split('assets={}')[0], str(Path(__file__).with_name('generate_assets.py')), 'exec'))
mat('fusion-plum', (.30,.14,.43), rough=.9)
mat('fusion-mint', (.39,.86,.64), rough=.8)
mat('fusion-leaf', (.39,.64,.20), rough=.9)
mat('fusion-teal', (.055,.58,.57), rough=.9)
mat('fusion-ivory', (.89,.95,.75), rough=.85)
mat('fusion-charcoal', (.09,.12,.14), rough=.9)
p=M['fusion-mint'].node_tree.nodes.get('Principled BSDF')
p.inputs['Emission Color'].default_value=(.39,.86,.64,1)
p.inputs['Emission Strength'].default_value=.2

def recolor(obj, material):
    obj.data.materials.clear(); obj.data.materials.append(M[material])

def leaf(name, loc, material='fusion-leaf', angle=0, scale=1):
    o=uv(name,loc,(.105*scale,.027*scale,.049*scale),material,16,10)
    o.rotation_euler.y=angle
    return o

def moon(loc):
    points=[(loc[0]+.058*math.cos(math.radians(55+i*250/14)),loc[1],loc[2]+.058*math.sin(math.radians(55+i*250/14))) for i in range(15)]
    for a,b in zip(points,points[1:]):rod('Embroidered mint moon',a,b,.012,'fusion-mint')

def sling(x,z=.66, soul=False):
    rod('Forked wooden seed launcher',(x,-.19,z-.24),(x,-.19,z+.05),.039,'wood')
    for side in [-1,1]:
        tip=(x+side*.092,-.19,z+.19)
        rod('Rounded seed fork',(x,-.19,z),tip,.030,'wood')
        uv('Soft fork end',tip,(.030,)*3,'wood',10,7)
        if soul:leaf('Soul leaf at fork',(tip[0]+side*.025,tip[1],tip[2]+.025),'fusion-mint',side*-.65,.55)
    rod('Gold launcher elastic',(x-.092,-.19,z+.18),(x+.092,-.19,z+.18),.01,'gold')
    uv('Ready seed',(x,-.215,z+.17),(.035,.038,.033),'fusion-mint' if soul else 'gold',12,8)

def shooter(x, material, soul=False, seed=False):
    cube('Rounded twin shooter',(x,-.29,.61),(.15,.34,.15),material,.03)
    rod('Short wooden grip',(x,-.17,.47),(x,-.17,.64),.041,'wood')
    rod('Golden muzzle',(x,-.40,.62),(x,-.54,.62),.045,'gold')
    o=torus('Mint muzzle collar' if soul else 'Seed muzzle collar',(x,-.53,.62),.061,.015,'fusion-mint' if soul else 'fusion-leaf');o.rotation_euler.x=math.pi/2
    if soul:
        uv('Soul cannon pearl',(x,-.28,.713),(.055,.070,.055),'fusion-mint',16,10)
    if seed:
        for side in [-1,1]:
            leaf('Launcher leaf',(x+side*.081,-.27,.692),'fusion-leaf',side*.4,.65)
        sling(x,.82,False)

def soul_staff(x):
    rod('Carved soul staff',(x,-.05,.23),(x,-.05,1.06),.03,'wood')
    uv('Mint soul flame',(x,-.05,1.15),(.105,.105,.12),'fusion-mint',20,12)
    uv('Cream flame tip',(x+.035,-.05,1.26),(.050,.049,.09),'fusion-ivory',16,10)
    ring=torus('Soul staff halo',(x,-.05,1.15),.145,.014,'gold');ring.rotation_euler.x=.55
    for side in [-1,1]:leaf('Soul staff leaf',(x+side*.115,-.05,1.04),'fusion-leaf',-side*.4,.9)

def patch_hat(colors):
    obj=next(o for o in parts if o.name.startswith('Drooping wool hat'))
    obj.data.materials.clear()
    for material in colors:obj.data.materials.append(M[material])
    for face in obj.data.polygons:
        # Sewn vertical color panels, visible from the game camera and portrait.
        center=face.center
        face.material_index=(0 if center.x<-.055 else 1 if center.x>.055 else len(colors)-1) % len(colors)
    for obj in parts:
        if obj.name.startswith(('Red pompom','Pompom fluff')):recolor(obj, colors[-1])
    torus('Cream knitted hat seam',(0,0,.842),.36,.017,'fusion-ivory')

def body(kind, colors):
    gnome('fusion',colors[0]);patch_hat(colors)
    for obj in parts:
        if obj.name.startswith('Woven plaid stripe'):
            recolor(obj,colors[int(obj.location.z>.35)%len(colors)])
        elif obj.name.startswith('Plaid coat'):recolor(obj,colors[1])
        elif obj.name.startswith('Suede boots'):recolor(obj,'fusion-charcoal')
    # Extra soft shoulder pads make fused forms read as more powerful toys.
    for side in [-1,1]:uv('Patchwork shoulder',(side*.33,.005,.665),(.13,.13,.095),colors[0 if side<0 else 1],16,10)
    if 'sprout' in kind:
        for side in [-1,1]:leaf('Hat leaf sprig',(side*.15,-.275,1.03),'fusion-leaf',side*-.55,.95)
    if 'necro' in kind:moon((0,-.31,1.015))
    if 'multi' in kind:
        for side in [-1,1]:
            cube('Twin teal cuff stitch',(side*.36,-.154,.495),(.075,.025,.05),'fusion-teal',.013)

def grounded_export(name):
    bpy.context.view_layer.update()
    low=min((obj.matrix_world@Vector(corner)).z for obj in parts for corner in obj.bound_box)
    for obj in parts:obj.location.z-=low
    return export(name)

assets={}
reset();body('multi-sprout',['fusion-teal','green'])
for x in [-.37,.37]:shooter(x,'fusion-teal',seed=True)
assets['multi-sprout']=grounded_export('gnome-fusion-multi-sprout')

reset();body('necro-sprout',['fusion-plum','green'])
soul_staff(.43);sling(-.39,.67,True)
for side in [-1,1]:leaf('Gravebloom coat petal',(side*.215,-.29,.27),'fusion-mint',side*.5,.6)
assets['necro-sprout']=grounded_export('gnome-fusion-necro-sprout')

reset();body('multi-necro',['fusion-plum','fusion-teal'])
for x in [-.38,.38]:shooter(x,'fusion-plum',soul=True)
for x in [-.18,.18]:
    uv('Mint shoulder flame',(x,.06,1.38),(.039,.044,.08),'fusion-mint',12,8)
assets['multi-necro']=grounded_export('gnome-fusion-multi-necro')

reset();body('multi-necro-sprout',['fusion-teal','fusion-plum','green'])
for x in [-.38,.38]:shooter(x,'fusion-plum',soul=True,seed=True)
# A branching soul sapling on the back distinguishes the final combined form.
rod('Living soul sapling',(.04,.22,.46),(.04,.22,1.40),.035,'wood')
for side in [-1,1]:
    rod('Soul sapling branch',(.04,.22,1.11),(side*.27,.22,1.38),.025,'wood')
    leaf('Crown soul leaf',(side*.30,.21,1.40),'fusion-leaf',side*-.6,1.1)
    uv('Crown soul pearl',(side*.26,.21,1.49),(.061,.052,.072),'fusion-mint',16,10)
uv('Trinity crown seed',(.04,.22,1.48),(.083,.075,.10),'gold',16,10)
assets['multi-necro-sprout']=grounded_export('gnome-fusion-multi-necro-sprout')

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100
scene.world.color=(.35,.35,.35);scene.view_settings.view_transform='AgX'
for name,loc,power,size in [('Warm softbox',(-3,-4,5),380,4),('Cool fill',(3,-1,3),220,3),('Rim light',(1,3,4),450,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);obj=bpy.context.object;obj.name=name;obj.data.energy=power;obj.data.shape='DISK';obj.data.size=size;obj.rotation_euler=(Vector((0,0,.7))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.3,-5,2.8));cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,.76))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.05;scene.camera=cam
for key,obj in assets.items():
    obj.hide_render=False;obj.hide_set(False)
    scene.render.filepath=os.path.join(OUT,'fusion-'+key+'.png');bpy.ops.render.render(write_still=True)
    obj.hide_render=True;obj.hide_set(True)
for x,obj in zip([-2.0,-.67,.67,2.0],assets.values()):
    obj.location.x=x;obj.hide_render=False;obj.hide_set(False)
cam.location=(.5,-8,3.5);cam.rotation_euler=(Vector((0,0,.76))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=5.6
scene.render.resolution_x=1400;scene.render.resolution_y=600
scene.render.filepath=os.path.join(ROOT,'art','fusions-preview.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','fusions.blend'),compress=True)
print('GNOMEWARD_FUSIONS_COMPLETE')
