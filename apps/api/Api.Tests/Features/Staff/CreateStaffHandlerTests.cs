using Api.Features.Staff.Create;
using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace Api.Tests.Features.Staff;

public class CreateStaffHandlerTests
{
    private AppDbContext CreateDb(Guid? companyId = null)
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new AppDbContext(opts);
        if (companyId.HasValue) db.SetTenant(companyId.Value);
        return db;
    }

    [Fact]
    public async Task Handle_ValidCommand_CreatesStaffProfileAndBuRecord()
    {
        var companyId = Guid.NewGuid();
        var buId = Guid.NewGuid();
        var db = CreateDb(companyId);

        db.Companies.Add(new Company { Id = companyId, Name = "Test Co", Address = "A", ContactNumber = "123" });
        db.BusinessUnits.Add(new BusinessUnit { Id = buId, CompanyId = companyId, Name = "Default", IsDefault = true });
        await db.SaveChangesAsync();

        var handler = new CreateStaffHandler(db);
        var cmd = new CreateStaffCommand("Jane", "Doe", "Staff", buId, "jane@test.com", "Staff")
        {
            CompanyId = companyId
        };

        var staffId = await handler.Handle(cmd, CancellationToken.None);

        staffId.Should().NotBe(Guid.Empty);
        (await db.StaffProfiles.CountAsync()).Should().Be(1);
        (await db.StaffBus.CountAsync()).Should().Be(1);
        var staffBu = await db.StaffBus.FirstAsync();
        staffBu.Email.Should().Be("jane@test.com");
        staffBu.BuId.Should().Be(buId);
        (await db.Users.CountAsync()).Should().Be(1);
        var user = await db.Users.FirstAsync();
        user.Role.Should().Be("Staff");
    }
}
