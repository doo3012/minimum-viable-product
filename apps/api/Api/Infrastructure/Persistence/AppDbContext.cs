using Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Api.Infrastructure.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    // Tenant filter is applied via query filter registered per request
    // We use a Guid? field that gets set by TenantBehavior via ICurrentTenant
    private Guid? _currentTenantId;

    public void SetTenant(Guid tenantId) => _currentTenantId = tenantId;

    public DbSet<Company> Companies => Set<Company>();
    public DbSet<BusinessUnit> BusinessUnits => Set<BusinessUnit>();
    public DbSet<User> Users => Set<User>();
    public DbSet<StaffProfile> StaffProfiles => Set<StaffProfile>();
    public DbSet<StaffBu> StaffBus => Set<StaffBu>();
    public DbSet<ChatPermission> ChatPermissions => Set<ChatPermission>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("main");

        modelBuilder.Entity<Company>(e => e.ToTable("companies"));
        modelBuilder.Entity<BusinessUnit>(e => {
            e.ToTable("business_units");
            e.HasQueryFilter(b => !_currentTenantId.HasValue || b.CompanyId == _currentTenantId);
        });
        modelBuilder.Entity<User>(e => {
            e.ToTable("users");
            e.HasQueryFilter(u => !_currentTenantId.HasValue || u.CompanyId == _currentTenantId);
        });
        modelBuilder.Entity<StaffProfile>(e => {
            e.ToTable("staff_profiles");
            e.HasQueryFilter(s => !_currentTenantId.HasValue || s.CompanyId == _currentTenantId);
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId);
            e.HasMany(s => s.StaffBus).WithOne().HasForeignKey(sb => sb.StaffId);
        });
        modelBuilder.Entity<StaffBu>(e => {
            e.ToTable("staff_bu");
            e.HasOne(sb => sb.Bu).WithMany().HasForeignKey(sb => sb.BuId);
        });
        modelBuilder.Entity<ChatPermission>(e => e.ToTable("chat_permissions"));
    }
}
